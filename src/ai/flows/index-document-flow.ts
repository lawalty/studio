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
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

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
    // Final, robust cleaning step before chunking.
    // This removes the UTF-8 BOM and other non-printable control characters that can
    // cause the embedding model to fail, while preserving essential whitespace.
    const cleanText = text.replace(/^\uFEFF/, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 1. Chunk the text using a semantic splitter
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1800,
      chunkOverlap: 200,
    });

    const chunks = await splitter.splitText(cleanText);

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
        // The main cleaning is now done before chunking.
        // We only need to check for empty chunks here.
        if (chunk.trim().length === 0) {
          failedChunks++;
          const errorMsg = 'Chunk was empty or contained only whitespace.';
          if (!firstError) firstError = errorMsg;
          console.warn(`[indexDocumentFlow] Skipped a chunk from '${sourceName}' because it was empty after cleaning.`);
          continue;
        }
        
        const { embedding } = await ai.embed({
          embedder: 'googleai/text-embedding-004',
          content: chunk, // Use the chunk directly
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
            text: chunk, // Use the original chunk from the splitter
            embedding: embedding,
            createdAt: new Date().toISOString(),
            downloadURL,
          });
        } else {
          failedChunks++;
          const errorMsg = 'Embedding call returned no embedding.';
          if (!firstError) firstError = errorMsg;
          console.warn(
            `[indexDocumentFlow] Skipped a chunk from '${sourceName}' because it failed to generate an embedding. The chunk may be empty or contain unsupported content. Content: "${chunk.substring(0, 100)}..."`
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
