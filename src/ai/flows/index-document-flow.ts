
'use server';
/**
 * @fileOverview A flow to index a document by chunking its text,
 * generating vector embeddings, and storing them in Firestore.
 *
 * - indexDocument - Chunks and embeds text from a document.
 * - IndexDocumentInput - The input type for the function.
 * - IndexDocumentOutput - The return type for the function.
 */

import { ai, embedderAi } from '@/ai/genkit';
import { z } from 'genkit';
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';

const IndexDocumentInputSchema = z.object({
  sourceId: z.string().describe('The unique ID of the source document.'),
  sourceName: z.string().describe('The original filename of the source document.'),
  text: z.string().describe('The full text content of the document to be indexed.'),
  level: z.string().describe('The priority level of the knowledge base (e.g., High, Medium).'),
  downloadURL: z.string().url().optional().describe('The public download URL for the source file. Omit for sources without a URL, like pasted text.'),
});
export type IndexDocumentInput = z.infer<typeof IndexDocumentInputSchema>;

const IndexDocumentOutputSchema = z.object({
  chunksIndexed: z.number().describe('The number of text chunks created and stored.'),
  sourceId: z.string().describe('The unique ID of the source document that was processed.'),
});
export type IndexDocumentOutput = z.infer<typeof IndexDocumentOutputSchema>;

export async function indexDocument(input: IndexDocumentInput): Promise<IndexDocumentOutput> {
  return indexDocumentFlow(input);
}

/**
 * A simple text splitter function.
 * This is a basic implementation and doesn't respect word boundaries.
 * @param text The text to split.
 * @param options Chunking options.
 * @returns An array of text chunks.
 */
function simpleSplitter(text: string, { chunkSize, chunkOverlap }: { chunkSize: number; chunkOverlap: number }): string[] {
  if (chunkOverlap >= chunkSize) {
    throw new Error("chunkOverlap must be smaller than chunkSize.");
  }
  if (text.length <= chunkSize) {
    return [text].filter(c => c.trim() !== ''); // Return only if not empty
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


const indexDocumentFlow = ai.defineFlow(
  {
    name: 'indexDocumentFlow',
    inputSchema: IndexDocumentInputSchema,
    outputSchema: IndexDocumentOutputSchema,
  },
  async ({ sourceId, sourceName, text, level, downloadURL }) => {
    const cleanText = text.replace(/^\uFEFF/, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();

    // 1. Chunk the text using the simple, internal splitter
    const chunks = simpleSplitter(cleanText, {
      chunkSize: 1500, // Reduced size slightly for safety
      chunkOverlap: 150,
    });

    if (chunks.length === 0) {
      console.error(`[indexDocumentFlow] No text chunks generated from document '${sourceName}'. Aborting.`);
      throw new Error("No readable text content was found in the document after processing. Indexing aborted.");
    }

    // 2. Generate embeddings and prepare data for Firestore.
    const chunksToSave: any[] = [];
    let failedChunks = 0;
    let firstError = '';

    for (const chunk of chunks) {
      try {
        const trimmedChunk = chunk.trim();
        if (trimmedChunk.length === 0) {
          failedChunks++;
          const errorMsg = 'Chunk was empty or contained only whitespace.';
          if (!firstError) firstError = errorMsg;
          console.warn(`[indexDocumentFlow] Skipped a chunk from '${sourceName}' because it was empty after cleaning.`);
          continue;
        }
        
        // Use the dedicated embedderAi instance
        const { embedding } = await embedderAi.embed({
          embedder: 'googleai/text-embedding-004',
          content: trimmedChunk,
        });

        if (embedding && Array.isArray(embedding) && embedding.length > 0) {
          chunksToSave.push({
            sourceId,
            sourceName,
            level,
            text: trimmedChunk,
            embedding: embedding,
            createdAt: new Date().toISOString(),
            downloadURL,
          });
        } else {
          failedChunks++;
          const errorMsg = 'Embedding call returned an empty or invalid result from the AI model.';
          if (!firstError) firstError = errorMsg;
          console.warn(
            `[indexDocumentFlow] Skipped a chunk from '${sourceName}' because it failed to generate a valid embedding. The content might be unsupported by the model. Content: "${trimmedChunk.substring(0, 100)}..."`
          );
        }
      } catch (error: any) {
        failedChunks++;
        const errorMsg = error.message || 'An unknown error occurred during embedding.';
        if (!firstError) firstError = errorMsg;
        console.error(
          `[indexDocumentFlow] Error embedding a chunk from '${sourceName}'. Skipping chunk. Error: ${errorMsg}. Content: "${chunk.substring(0, 100)}..."`
        );
      }
    }
    
    if (failedChunks > 0) {
        console.log(`[indexDocumentFlow] Finished processing '${sourceName}'. Successfully embedded ${chunksToSave.length} chunks and skipped ${failedChunks} failed chunks.`);
    }

    if (chunksToSave.length === 0) {
      console.log(`[indexDocumentFlow] No chunks were successfully embedded for '${sourceName}'. Nothing to save to Firestore.`);
      if (failedChunks > 0) {
          if (firstError.includes('API_KEY_INVALID') || firstError.includes('PERMISSION_DENIED')) {
              throw new Error(`Failed to index '${sourceName}' due to an authentication or permission issue. Please ensure the app's service account has the 'Vertex AI User' role in Google Cloud IAM, and that the 'Generative Language API' is enabled for this project. Original error: ${firstError}`);
          }
          throw new Error(`Failed to index '${sourceName}'. All ${failedChunks} text chunks failed. The AI model did not produce a valid embedding. First error: ${firstError}`);
      }
      return { chunksIndexed: 0, sourceId };
    }

    const batch = writeBatch(db);
    const chunksCollectionRef = collection(db, 'kb_chunks');

    chunksToSave.forEach((chunkData) => {
      const chunkDocRef = doc(chunksCollectionRef);
      batch.set(chunkDocRef, chunkData);
    });

    await batch.commit();

    return { chunksIndexed: chunksToSave.length, sourceId };
  }
);
