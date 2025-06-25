'use server';
/**
 * @fileOverview A flow to index a document by chunking its text,
 * generating vector embeddings, and storing them in Firestore.
 *
 * - indexDocument - Chunks and embeds text from a document.
 * - IndexDocumentInput - The input type for the function.
 * - IndexDocumentOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';

/**
 * Splits a given text into chunks of a specified size.
 * This is a simple, robust splitter that works on pre-cleaned text.
 * @param text The text to chunk.
 * @param chunkSize The maximum size for each chunk in characters.
 * @returns An array of text chunks.
 */
function chunkText(text: string, chunkSize: number = 1800): string[] {
    if (!text || text.trim().length === 0) {
        return [];
    }
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.substring(i, i + chunkSize));
    }
    return chunks;
}


const IndexDocumentInputSchema = z.object({
  sourceId: z.string().describe('The unique ID of the source document.'),
  sourceName: z.string().describe('The original filename of the source document.'),
  text: z.string().describe('The full text content of the document to be indexed.'),
  level: z.string().describe('The priority level of the knowledge base (e.g., High, Medium).'),
  downloadURL: z.string().url().describe('The public download URL for the source file.'),
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

const indexDocumentFlow = ai.defineFlow(
  {
    name: 'indexDocumentFlow',
    inputSchema: IndexDocumentInputSchema,
    outputSchema: IndexDocumentOutputSchema,
  },
  async ({ sourceId, sourceName, text, level, downloadURL }) => {
    // 1. Chunk the text (which is now pre-cleaned by the new AI extraction flow)
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      console.error(`[indexDocumentFlow] No text chunks found in document '${sourceName}'. Aborting.`);
      throw new Error("No readable text content was found in the document after processing. Indexing aborted.");
    }

    // 2. Generate embeddings and prepare data for Firestore.
    const chunksToSave: any[] = [];
    let failedChunks = 0;
    let firstError = '';

    for (const chunk of chunks) {
      try {
        // Based on user feedback about potential encoding issues (e.g., non-UTF-8), this step
        // performs a final, aggressive cleaning of each chunk before it's sent for embedding.
        // It removes the UTF-8 Byte Order Mark (BOM) and any non-ASCII characters
        // that could cause the embedding model to reject the content as "invalid".
        const cleanedChunk = chunk
          .replace(/^\uFEFF/, '') // Remove BOM
          .replace(/[^\x00-\x7F]/g, ''); // Remove all non-ASCII characters.

        if (cleanedChunk.trim().length === 0) {
          failedChunks++;
          const errorMsg = 'Chunk became empty after cleaning, indicating it may have only contained unsupported characters.';
          if (!firstError) firstError = errorMsg;
          console.warn(`[indexDocumentFlow] Skipped a chunk from '${sourceName}' because it was empty after cleaning.`);
          continue;
        }
        
        const { embedding } = await ai.embed({
          embedder: 'googleai/text-embedding-004',
          content: cleanedChunk, // Use the cleaned chunk
          config: {
            safetySettings: [
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
            ],
          },
        });

        if (embedding) {
          chunksToSave.push({
            sourceId,
            sourceName,
            level,
            text: cleanedChunk, // IMPORTANT: Save the cleaned chunk to ensure data consistency
            embedding: embedding,
            createdAt: new Date().toISOString(),
            downloadURL,
          });
        } else {
          failedChunks++;
          const errorMsg = 'Embedding call returned no embedding.';
          if (!firstError) firstError = errorMsg;
          console.warn(
            `[indexDocumentFlow] Skipped a chunk from '${sourceName}' because it failed to generate an embedding. The chunk may be empty or contain unsupported content. Content: "${cleanedChunk.substring(0, 100)}..."`
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

    // 3. If no chunks were successfully embedded, exit early.
    if (chunksToSave.length === 0) {
      console.log(`[indexDocumentFlow] No chunks were successfully embedded for '${sourceName}'. Nothing to save to Firestore.`);
      if (failedChunks > 0) {
          throw new Error(`Failed to index '${sourceName}'. All ${failedChunks} text chunks failed. First error: ${firstError}`);
      }
      return { chunksIndexed: 0, sourceId };
    }

    // 4. Save the successfully embedded chunks to Firestore in a batch
    const batch = writeBatch(db);
    const chunksCollectionRef = collection(db, 'kb_chunks');

    chunksToSave.forEach((chunkData) => {
      const chunkDocRef = doc(chunksCollectionRef); // Auto-generates ID for each chunk
      batch.set(chunkDocRef, chunkData);
    });

    await batch.commit();

    return { chunksIndexed: chunksToSave.length, sourceId };
  }
);
