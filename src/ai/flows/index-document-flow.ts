
'use server';
/**
 * @fileOverview A flow to index a document by chunking its text, generating an
 * embedding, and writing the data to Firestore for metadata and native vector search.
 */
import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit';
import { preprocessText } from '@/ai/retrieval/preprocessing';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
            // Check for common retriable error messages or status codes
            if (errorMessage.includes('quota') || errorMessage.includes('rate limit') || errorMessage.includes('service unavailable') || (error.status && [429, 503].includes(error.status))) {
                if (i < retries - 1) {
                    const delay = initialDelay * Math.pow(2, i) + Math.random() * 1000;
                    console.log(`[withRetry] Retriable error detected. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${i + 1}/${retries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } else {
                // If it's not a retriable error, throw it immediately.
                throw error;
            }
        }
    }
    console.error(`[withRetry] Failed after ${retries} attempts.`);
    throw lastError; // Throw the last error after all retries have failed.
}

export async function indexDocument({ 
    sourceId, sourceName, text, level, topic, downloadURL,
    linkedEnglishSourceId, pageNumber, title, header
}: IndexDocumentInput): Promise<IndexDocumentOutput> {
      const sourceDocRef = db.collection('kb_meta').doc(sourceId);
      let successfulChunks = 0;

      try {
        const chunks = simpleSplitter(text, { chunkSize: 1000, chunkOverlap: 100 });
        
        if (chunks.length === 0) {
            const finalMetadata: Record<string, any> = {
                indexingStatus: 'success', chunksWritten: 0,
                indexedAt: new Date().toISOString(), indexingError: "Document processed but yielded no text chunks.",
                sourceName, downloadURL: downloadURL || null,
                level, topic,
            };
            if (linkedEnglishSourceId) {
                finalMetadata.linkedEnglishSourceId = linkedEnglishSourceId;
            }
            await sourceDocRef.set(finalMetadata, { merge: true });
            return { chunksWritten: 0, sourceId, success: true };
        }

        for (let index = 0; index < chunks.length; index++) {
          const originalChunkText = chunks[index];
          
          const chunkId = `${sourceId}_${index + 1}`;
          
          const processedChunkTextForEmbedding = preprocessText(originalChunkText);
          if (!processedChunkTextForEmbedding) continue;
          
          const embeddingResponse = await withRetry(() => ai.embed({
              embedder: 'googleai/text-embedding-004',
              content: processedChunkTextForEmbedding,
          }));
          const embeddingVector = embeddingResponse?.[0]?.embedding;

          if (!embeddingVector || !Array.isArray(embeddingVector) || embeddingVector.length !== 768) {
            console.warn(`Skipping chunk ${index + 1} due to invalid embedding.`);
            continue;
          }
          
          const chunkData: Record<string, any> = {
            sourceId,
            sourceName,
            text: processedChunkTextForEmbedding,
            chunkNumber: index + 1,
            createdAt: new Date().toISOString(),
            downloadURL: downloadURL || null,
            pageNumber: pageNumber || null,
            title: title || null,
            header: header || null,
            embedding: embeddingVector,
            level,
            topic,
          };

          if (linkedEnglishSourceId) {
              chunkData.linkedEnglishSourceId = linkedEnglishSourceId;
          }
          // The document ID for a chunk within a collection group needs a full path.
          // This must write to the actual subcollection under the metadata document.
          const actualChunkDocRef = db.collection('kb_meta').doc(sourceId).collection('kb_chunks').doc(chunkId);
          await actualChunkDocRef.set(chunkData);
          successfulChunks++;
        }
        
        const finalMetadata: Record<string, any> = {
          indexingStatus: 'success', chunksWritten: successfulChunks,
          indexedAt: new Date().toISOString(), indexingError: null,
          sourceName, downloadURL: downloadURL || null,
          level, topic,
        };
        if (linkedEnglishSourceId) {
            finalMetadata.linkedEnglishSourceId = linkedEnglishSourceId;
        }
        await sourceDocRef.set(finalMetadata, { merge: true });
        
        return { chunksWritten: successfulChunks, sourceId, success: true };

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
            sourceName, downloadURL: downloadURL || null,
            level, topic,
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
