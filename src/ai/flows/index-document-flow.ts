
'use server';
/**
 * @fileOverview A flow to index a document by chunking its text, generating an
 * embedding, and writing the data to Firestore for metadata and native vector search.
 */
import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit';
import { preprocessText } from '@/ai/retrieval/preprocessing';

const IndexDocumentInputSchema = z.object({
  sourceId: z.string().describe('The unique ID of the source document.'),
  sourceName: z.string().describe('The original filename of the source document.'),
  text: z.string().describe('The full text content of the document to be indexed.'),
  level: z.string().describe('The priority level of the knowledge base (e.g., High, Medium).'),
  topic: z.string().describe('The topic category for the document.'),
  downloadURL: z.string().url().optional().describe('The public downloadURL for the source file.'),
  linkedEnglishSourceId: z.string().optional().describe('If this is a Spanish PDF, the ID of the English source it corresponds to.'),
  pageNumber: z.number().optional().describe('The page number of the document chunk.'),
  title: z.string().optional().describe('The title of the document.'),
  header: z.string().optional().describe('The header of the document section.'),
});
export type IndexDocumentInput = z.infer<typeof IndexDocumentInputSchema>;

const IndexDocumentOutputSchema = z.object({
  chunksWritten: z.number().describe('The number of text chunks written to Firestore.'),
  sourceId: z.string().describe('The unique ID of the source document that was processed.'),
  success: z.boolean().describe('Indicates whether the operation completed without errors.'),
  error: z.string().optional().describe('An error message if the operation failed.'),
});
export type IndexDocumentOutput = z.infer<typeof IndexDocumentOutputSchema>;

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

export async function withRetry<T>(fn: () => Promise<T>, retries = 3, initialDelay = 1000): Promise<T> {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            const errorMessage = (error.message || '').toLowerCase();
            if (errorMessage.includes('quota') || errorMessage.includes('rate limit') || errorMessage.includes('service unavailable') || (error.status && [429, 503].includes(error.status))) {
                if (i < retries - 1) {
                    const delay = initialDelay * Math.pow(2, i) + Math.random() * 1000;
                    console.log(`[withRetry] Retriable error detected. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${i + 1}/${retries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } else {
                throw error;
            }
        }
    }
    console.error(`[withRetry] Failed after ${retries} attempts.`);
    throw lastError;
}

export async function indexDocument({ 
    sourceId, sourceName, text, level, topic, downloadURL,
    linkedEnglishSourceId, pageNumber, title, header
}: IndexDocumentInput): Promise<IndexDocumentOutput> {
      const sourceDocRef = db.collection('kb_meta').doc(sourceId);

      try {
        const processedText = preprocessText(text); 
        if (!processedText.trim()) {
            const errorMessage = "No readable text content found after extraction and processing.";
            await sourceDocRef.set({
              indexingStatus: 'failed',
              indexingError: errorMessage,
              sourceName, level, topic, downloadURL: downloadURL || null, createdAt: new Date().toISOString(),
            }, { merge: true });
            return { chunksWritten: 0, sourceId, success: false, error: errorMessage };
        }
        
        const chunks = simpleSplitter(processedText, { chunkSize: 1000, chunkOverlap: 100 });
        
        if (chunks.length === 0) {
            const finalMetadata: Record<string, any> = {
                indexingStatus: 'success', chunksWritten: 0,
                indexedAt: new Date().toISOString(), indexingError: "Document processed but yielded no text chunks.",
                sourceName, level, topic, downloadURL: downloadURL || null,
            };
            if (linkedEnglishSourceId) {
                finalMetadata.linkedEnglishSourceId = linkedEnglishSourceId;
            }
            await sourceDocRef.set(finalMetadata, { merge: true });
            return { chunksWritten: 0, sourceId, success: true };
        }

        const firestoreBatch = db.batch();
        const chunksCollection = db.collection('kb_chunks'); 

        for (let index = 0; index < chunks.length; index++) {
          const chunkText = chunks[index];
          
          const embeddingResponse = await withRetry(() => ai.embed({
              embedder: 'googleai/text-embedding-004',
              content: chunkText,
              options: { taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: 768 }
          }));
          const embeddingVector = embeddingResponse?.[0]?.embedding;
          if (!embeddingVector || !Array.isArray(embeddingVector) || embeddingVector.length !== 768) {
            throw new Error(`Failed to generate a valid 768-dimension embedding for chunk ${index + 1}.`);
          }

          const newChunkDocRef = chunksCollection.doc(); 
          
          const chunkData: Record<string, any> = {
            sourceId, sourceName, level, topic, text: chunkText,
            chunkNumber: index + 1, createdAt: new Date().toISOString(),
            downloadURL: downloadURL || null, pageNumber: pageNumber || null,
            title: title || null, header: header || null,
            embedding: embeddingVector,
          };
          if (linkedEnglishSourceId) {
              chunkData.linkedEnglishSourceId = linkedEnglishSourceId;
          }
          firestoreBatch.set(newChunkDocRef, chunkData);
        }

        await firestoreBatch.commit();
        
        const finalMetadata: Record<string, any> = {
          indexingStatus: 'success', chunksWritten: chunks.length,
          indexedAt: new Date().toISOString(), indexingError: null,
          sourceName, level, topic, downloadURL: downloadURL || null,
        };
        if (linkedEnglishSourceId) {
            finalMetadata.linkedEnglishSourceId = linkedEnglishSourceId;
        }
        await sourceDocRef.set(finalMetadata, { merge: true });
        
        return { chunksWritten: chunks.length, sourceId, success: true };

      } catch (e: any) {
        console.error(`[indexDocument] Raw error for source '${sourceName}':`, e);
        const rawError = e instanceof Error ? e.message : (e.message || JSON.stringify(e));
        let detailedError: string;

        if (rawError.includes("permission denied") || rawError.includes('IAM')) {
            detailedError = `Indexing failed due to a permissions issue. Ensure your service account has the "Cloud Datastore User" or "Firebase Admin" role.`;
        } else {
            detailedError = `Indexing failed for an unexpected reason. Full technical error: ${rawError}`;
        }

        try {
          const failureMetadata: Record<string, any> = { 
            indexingStatus: 'failed', indexingError: detailedError, 
            sourceName, level, topic, downloadURL: downloadURL || null 
          };
          if (linkedEnglishSourceId) {
            failureMetadata.linkedEnglishSourceId = linkedEnglishSourceId;
          }
          await sourceDocRef.set(failureMetadata, { merge: true });
        } catch (updateError) {
          console.error(`[indexDocument] CRITICAL: Failed to write failure status to Firestore for source '${sourceName}'.`, updateError);
        }
        return { chunksWritten: 0, sourceId, success: false, error: detailedError };
      }
}
