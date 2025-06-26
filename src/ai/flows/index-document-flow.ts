
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
import { textEmbedding004 } from '@genkit-ai/googleai';

const IndexDocumentInputSchema = z.object({
  sourceId: z.string().describe('The unique ID of the source document.'),
  sourceName: z.string().describe('The original filename of the source document.'),
  text: z.string().describe('The full text content of the document to be indexed.'),
  level: z.string().describe('The priority level of the knowledge base (e.g., High, Medium).'),
  downloadURL: z.string().url().optional().describe('The public download URL for the source file. Omit for sources without a URL, like pasted text.'),
});
export type IndexDocumentInput = z.infer<typeof IndexDocumentInputSchema>;

const IndexDocumentOutputSchema = z.object({
  chunksCreated: z.number().describe('The number of chunks the text was split into.'),
  chunksIndexed: z.number().describe('The number of text chunks created and stored.'),
  sourceId: z.string().describe('The unique ID of the source document that was processed.'),
  success: z.boolean().describe('Indicates whether the indexing process completed without critical errors.'),
  error: z.string().optional().describe('An error message if the indexing failed.'),
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
    // This is a developer configuration error, so throwing is appropriate.
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
    const cleanText = text.replace(/[^\x20-\x7E\n\r\t]/g, '').trim();

    if (!cleanText) {
       const errorMessage = "No readable text content was found in the document after processing. Indexing aborted.";
       console.warn(`[indexDocumentFlow] ${errorMessage} Document: '${sourceName}'.`);
       return { chunksCreated: 0, chunksIndexed: 0, sourceId, success: false, error: errorMessage };
    }
    
    const chunks = simpleSplitter(cleanText, {
      chunkSize: 1500,
      chunkOverlap: 150,
    });
    
    const chunksToSave: any[] = [];
    let failedChunks = 0;
    let firstError: string | null = null;
    let firstFailedChunkContent: string | null = null;

    for (const chunk of chunks) {
      try {
        const trimmedChunk = chunk.trim();
        if (trimmedChunk.length === 0) {
          continue;
        }
        
        const { embedding } = await ai.embed({
          embedder: textEmbedding004,
          content: trimmedChunk,
          taskType: 'RETRIEVAL_DOCUMENT',
        });

        // Use a more lenient check for the embedding result that supports TypedArrays.
        if (embedding?.length > 0) {
          chunksToSave.push({
            sourceId,
            sourceName,
            level,
            text: trimmedChunk,
            // Convert to a standard array before saving to Firestore for compatibility.
            embedding: Array.from(embedding),
            createdAt: new Date().toISOString(),
            downloadURL,
          });
        } else {
          failedChunks++;
          const errorMsg = 'The embedding service returned a successful response, but the response was empty. This often points to a configuration issue in your Google Cloud project (e.g., Billing not enabled for the project, or the Vertex AI API is not fully provisioned). Please verify your project settings in the Google Cloud Console.';
          if (!firstError) {
            firstError = errorMsg;
            firstFailedChunkContent = trimmedChunk;
          }
          console.warn(
            `[indexDocumentFlow] Skipped a chunk from '${sourceName}' because the embedding result was empty. This may indicate a cloud configuration issue. Content: "${trimmedChunk.substring(0, 100)}..."`
          );
        }
      } catch (error: any) {
        failedChunks++;
        const errorMsg = `The embedding service threw an error: ${error.message || 'Unknown error'}. This could be a permission or authentication issue. Please check the 'Vertex AI User' role and ensure the API is enabled and that billing is active on your Google Cloud project.`;
        if (!firstError) {
          firstError = errorMsg;
          firstFailedChunkContent = chunk;
        }
        console.error(
          `[indexDocumentFlow] Error embedding a chunk from '${sourceName}'. Skipping chunk. Error: ${error.message}. Content: "${chunk.substring(0, 100)}..."`
        );
      }
    }
    
    if (failedChunks > 0) {
        console.log(`[indexDocumentFlow] Finished processing '${sourceName}'. Successfully embedded ${chunksToSave.length} chunks and skipped ${failedChunks} failed chunks.`);
    }

    if (chunksToSave.length === 0 && failedChunks > 0) {
        const finalError = `${firstError}. \n\nFailed Chunk Content:\n"${firstFailedChunkContent}"`;
        return { chunksCreated: chunks.length, chunksIndexed: 0, sourceId, success: false, error: finalError };
    }

    if (chunksToSave.length > 0) {
        const batch = writeBatch(db);
        const chunksCollectionRef = collection(db, 'kb_chunks');

        chunksToSave.forEach((chunkData) => {
          const chunkDocRef = doc(chunksCollectionRef);
          batch.set(chunkDocRef, chunkData);
        });

        await batch.commit();
    }

    return { chunksCreated: chunks.length, chunksIndexed: chunksToSave.length, sourceId, success: true };
  }
);
