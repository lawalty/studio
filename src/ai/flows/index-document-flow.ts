
'use server';
/**
 * @fileOverview A flow to index a document by chunking its text, generating an
 * embedding for each chunk with a retry mechanism, and writing the complete data to Firestore.
 *
 * - indexDocument - Chunks text, generates embeddings, and writes to Firestore.
 * - IndexDocumentInput - The input type for the function.
 * - IndexDocumentOutput - The return type for the function.
 */
import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit'; // Ensures Genkit is configured

const IndexDocumentInputSchema = z.object({
  sourceId: z.string().describe('The unique ID of the source document.'),
  sourceName: z.string().describe('The original filename of the source document.'),
  text: z.string().describe('The full text content of the document to be indexed.'),
  level: z.string().describe('The priority level of the knowledge base (e.g., High, Medium).'),
  topic: z.string().describe('The topic category for the document.'),
  downloadURL: z.string().url().optional().describe('The public downloadURL for the source file.'),
  linkedEnglishSourceId: z.string().optional().describe('If this is a Spanish PDF, the ID of the English source it corresponds to.'),
});
export type IndexDocumentInput = z.infer<typeof IndexDocumentInputSchema>;

const IndexDocumentOutputSchema = z.object({
  chunksWritten: z.number().describe('The number of text chunks written to Firestore.'),
  sourceId: z.string().describe('The unique ID of the source document that was processed.'),
  success: z.boolean().describe('Indicates whether the operation completed without errors.'),
  error: z.string().optional().describe('An error message if the operation failed.'),
});
export type IndexDocumentOutput = z.infer<typeof IndexDocumentOutputSchema>;

// A simple text splitter function.
function simpleSplitter(text: string, { chunkSize, chunkOverlap }: { chunkSize: number; chunkOverlap: number }): string[] {
    if (chunkOverlap >= chunkSize) {
      throw new Error("chunkOverlap must be smaller than chunkSize.");
    }
    if (text.length <= chunkSize) {
      return [text].filter(c => c.trim() !== '');
    }

    const chunks: string[] = [];
    let index = 0;
    while (index < text.length) {
      const end = index + chunkSize;
      const chunk = text.slice(index, end);
      if (chunk.trim() !== '') {
        chunks.push(chunk);
      }
      index += chunkSize - chunkOverlap;
    }
    return chunks;
  }

// Helper function for retrying API calls with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, retries = 3, initialDelay = 1000): Promise<T> {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            // Check for quota-related errors specifically
            const errorMessage = (error.message || '').toLowerCase();
            if (errorMessage.includes('quota') || errorMessage.includes('rate limit') || (error.status && error.status === 429)) {
                if (i < retries - 1) { // Don't wait on the last attempt
                    const delay = initialDelay * Math.pow(2, i) + Math.random() * 1000;
                    console.log(`[withRetry] Rate limit hit. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${i + 1}/${retries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } else {
                // For non-retriable errors, fail immediately
                throw error;
            }
        }
    }
    console.error(`[withRetry] Failed after ${retries} attempts.`);
    throw lastError;
}


export async function indexDocument({ 
    sourceId, 
    sourceName, 
    text, 
    level, 
    topic, 
    downloadURL,
    linkedEnglishSourceId,
}: IndexDocumentInput): Promise<IndexDocumentOutput> {
      const collectionName = `kb_${level.toLowerCase().replace(/\s+/g, '_')}_meta_v1`;
      const sourceDocRef = db.collection(collectionName).doc(sourceId);

      try {
        const cleanText = text.trim();
        if (!cleanText) {
            const errorMessage = "No readable text content found after extraction. The file may be empty or incompatible. Please try re-processing or use a different file.";
            await sourceDocRef.set({
              indexingStatus: 'failed',
              indexingError: errorMessage,
              sourceName, level, topic, downloadURL: downloadURL || null, createdAt: new Date().toISOString(),
            }, { merge: true });
            return { chunksWritten: 0, sourceId, success: false, error: errorMessage };
        }
        
        const chunks = simpleSplitter(cleanText, {
          chunkSize: 1000, 
          chunkOverlap: 100,
        });

        if (chunks.length > 0) {
          const batch = db.batch();
          const chunksCollection = db.collection('kb_chunks');
          
          for (let index = 0; index < chunks.length; index++) {
            const chunkText = chunks[index];
            
            const embeddingResponse = await withRetry(() => ai.embed({
                embedder: 'googleai/text-embedding-004',
                content: chunkText,
            }));

            // Validate the complex structure returned by the embedding service.
            if (!embeddingResponse || !Array.isArray(embeddingResponse) || embeddingResponse.length === 0 || !embeddingResponse[0].embedding || !Array.isArray(embeddingResponse[0].embedding) || embeddingResponse[0].embedding.length === 0) {
              throw new Error(`Failed to generate a valid embedding for chunk number ${index + 1}. The embedding service returned an unexpected structure.`);
            }
            
            // Extract the actual numerical vector from the nested structure.
            const embeddingVector = embeddingResponse[0].embedding;

            const newChunkDocRef = chunksCollection.doc();
            const chunkData: Record<string, any> = {
              sourceId,
              sourceName,
              level,
              topic,
              text: chunkText,
              chunkNumber: index + 1,
              embedding: embeddingVector, // Save the final, correct vector.
              createdAt: new Date().toISOString(),
              downloadURL: downloadURL || null,
            };

            if (linkedEnglishSourceId) {
                chunkData.linkedEnglishSourceId = linkedEnglishSourceId;
            }

            batch.set(newChunkDocRef, chunkData);
          }
          
          await batch.commit();
        }
        
        const finalMetadata: Record<string, any> = {
          indexingStatus: 'success',
          chunksWritten: chunks.length,
          indexedAt: new Date().toISOString(),
          indexingError: null,
          sourceName, level, topic, downloadURL: downloadURL || null,
        };
        if (linkedEnglishSourceId) {
            finalMetadata.linkedEnglishSourceId = linkedEnglishSourceId;
        }

        await sourceDocRef.set(finalMetadata, { merge: true });
        
        return {
          chunksWritten: chunks.length,
          sourceId,
          success: true,
        };

      } catch (e: any) {
        console.error(`[indexDocument] Raw error for source '${sourceName}':`, e);
        const rawError = e instanceof Error ? e.message : (e.message || JSON.stringify(e));
        let detailedError: string;

        if (rawError.toLowerCase().includes('quota') || rawError.includes('429')) {
            detailedError = `Indexing failed after multiple retries due to API rate limits (quota exceeded). Please wait a few minutes before trying again or request a quota increase in your Google Cloud project.`;
        } else if (rawError.includes("Could not refresh access token")) {
            detailedError = `Indexing failed due to a local authentication error. Please run 'gcloud auth application-default login' and restart the dev server. See README.md.`;
        } else if (rawError.includes("PROJECT_BILLING_NOT_ENABLED")) {
            detailedError = `CRITICAL: Indexing failed because billing is not enabled for your Google Cloud project. Please enable it in the Google Cloud Console.`;
        } else if (e.code === 7 || (rawError && (rawError.includes('permission denied') || rawError.includes('IAM')))) {
            detailedError = `CRITICAL: The server failed to write to Firestore due to a permissions error. Please check IAM roles for your service account. It needs "Firebase Admin" or "Cloud Datastore User".`;
        } else if (rawError.includes("API key not valid") || rawError.includes("API key is missing")) {
            detailedError = `CRITICAL: Indexing failed due to an invalid or missing GEMINI_API_KEY. Please verify it in your .env.local file or hosting provider's secret manager.`;
        } else {
            detailedError = `Indexing failed for an unexpected reason. Full technical error: ${rawError}`;
        }

        try {
          const failureMetadata: Record<string, any> = { 
            indexingStatus: 'failed', 
            indexingError: detailedError, 
            sourceName, level, topic, 
            downloadURL: downloadURL || null 
          };
          if (linkedEnglishSourceId) {
            failureMetadata.linkedEnglishSourceId = linkedEnglishSourceId;
          }
          await sourceDocRef.set(failureMetadata, { merge: true });
        } catch (updateError) {
          console.error(`[indexDocument] CRITICAL: Failed to write failure status to Firestore for source '${sourceName}'.`, updateError);
        }

        return {
          chunksWritten: 0,
          sourceId,
          success: false,
          error: detailedError,
        };
      }
}
