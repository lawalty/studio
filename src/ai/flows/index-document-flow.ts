
'use server';
/**
 * @fileOverview A flow to index a document by chunking its text, generating an
 * embedding for each chunk, and writing the complete data to Firestore.
 *
 * - indexDocument - Chunks text, generates embeddings, and writes to Firestore.
 * - IndexDocumentInput - The input type for the function.
 * - IndexDocumentOutput - The return type for the function.
 */
import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit';

const IndexDocumentInputSchema = z.object({
  sourceId: z.string().describe('The unique ID of the source document.'),
  sourceName: z.string().describe('The original filename of the source document.'),
  text: z.string().describe('The full text content of the document to be indexed.'),
  level: z.string().describe('The priority level of the knowledge base (e.g., High, Medium).'),
  topic: z.string().describe('The topic category for the document.'),
  downloadURL: z.string().url().optional().describe('The public downloadURL for the source file.'),
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

export async function indexDocument({ 
    sourceId, 
    sourceName, 
    text, 
    level, 
    topic, 
    downloadURL 
}: IndexDocumentInput): Promise<IndexDocumentOutput> {
      // **FIXED**: The collection name was being incorrectly lowercased.
      // This ensures it matches the names used on the knowledge base page exactly (e.g., 'kb_high_meta_v1').
      const collectionName = `kb_${level.toLowerCase()}_meta_v1`;
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
          
          const embeddingResponses = await Promise.all(
            chunks.map(chunkText => ai.embed({
              embedder: 'googleai/text-embedding-004',
              content: chunkText,
            }))
          );

          chunks.forEach((chunkText, index) => {
            const newChunkDocRef = chunksCollection.doc();
            const embeddingVector = embeddingResponses[index];

            if (!embeddingVector || !Array.isArray(embeddingVector) || embeddingVector.length === 0) {
              throw new Error(`Failed to generate a valid embedding for chunk number ${index + 1}.`);
            }
            
            batch.set(newChunkDocRef, {
              sourceId,
              sourceName,
              level,
              topic,
              text: chunkText,
              chunkNumber: index + 1,
              createdAt: new Date().toISOString(),
              downloadURL: downloadURL || null,
              embedding: embeddingVector,
            });
          });
          
          await batch.commit();
        }
        
        await sourceDocRef.set({
          indexingStatus: 'success',
          chunksWritten: chunks.length,
          indexedAt: new Date().toISOString(),
          indexingError: null,
          sourceName, level, topic, downloadURL: downloadURL || null,
        }, { merge: true });
        
        return {
          chunksWritten: chunks.length,
          sourceId,
          success: true,
        };

      } catch (e: any) {
        console.error(`[indexDocument] Raw error for source '${sourceName}':`, e);
        const rawError = e instanceof Error ? e.message : (e.message || JSON.stringify(e));
        let detailedError: string;

        if (rawError.includes("Could not refresh access token")) {
            detailedError = `Indexing failed due to a local authentication error. Please run 'gcloud auth application-default login' and restart the dev server. See README.md.`;
        } else if (rawError.includes("PROJECT_BILLING_NOT_ENABLED")) {
            detailedError = `CRITICAL: Indexing failed because billing is not enabled for your Google Cloud project. Please enable it in the Google Cloud Console.`;
        } else if (e.code === 7 || (rawError && (rawError.includes('permission denied') || rawError.includes('IAM')))) {
            detailedError = `CRITICAL: The server failed to write to Firestore due to a permissions error. Please check IAM roles for your service account. It needs "Firebase Admin" or "Cloud Datastore User".`;
        } else if (rawError.includes("API key not valid") || rawError.includes("API key is missing")) {
            detailedError = `CRITICAL: Indexing failed due to an invalid or missing GOOGLE_AI_API_KEY. Please verify it in your .env.local file or hosting provider's secret manager.`;
        } else {
            detailedError = `Indexing failed for an unexpected reason. Full technical error: ${rawError}`;
        }

        try {
          await sourceDocRef.set({ indexingStatus: 'failed', indexingError: detailedError, sourceName, level, topic, downloadURL: downloadURL || null }, { merge: true });
        } catch (updateError) {
          console.error(`[indexDocument] CRITICAL: Failed to write failure status back to Firestore for source '${sourceName}'.`, updateError);
        }

        return {
          chunksWritten: 0,
          sourceId,
          success: false,
          error: detailedError,
        };
      }
}
