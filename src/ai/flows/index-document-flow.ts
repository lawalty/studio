
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
    // This more aggressive cleaning removes non-printable ASCII characters but preserves common whitespace like newlines and tabs.
    // This is crucial for handling text copied from various sources (websites, PDFs, etc.) that may contain invisible invalid characters.
    const cleanText = text.replace(/[^\x20-\x7E\n\r\t]/g, '').trim();

    if (!cleanText) {
       const errorMessage = "No readable text content was found in the document after processing. Indexing aborted.";
       console.warn(`[indexDocumentFlow] ${errorMessage} Document: '${sourceName}'.`);
       return { chunksIndexed: 0, sourceId, success: false, error: errorMessage };
    }

    // 1. Chunk the text using the simple, internal splitter
    const chunks = simpleSplitter(cleanText, {
      chunkSize: 1500, // Reduced size slightly for safety
      chunkOverlap: 150,
    });
    
    // 2. Generate embeddings and prepare data for Firestore.
    const chunksToSave: any[] = [];
    let failedChunks = 0;
    let firstError = '';

    for (const chunk of chunks) {
      try {
        const trimmedChunk = chunk.trim();
        if (trimmedChunk.length === 0) {
          continue; // Skip empty chunks silently
        }
        
        // Use the primary 'ai' instance for embedding
        const { embedding } = await ai.embed({
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
            `[indexDocumentFlow] Skipped a chunk from '${sourceName}' because it failed to generate a valid embedding. Chunk length: ${trimmedChunk.length}. The content might be unsupported by the model. Content: "${trimmedChunk.substring(0, 100)}..."`
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
      if (failedChunks > 0) {
        let finalError;
        if (firstError.includes('PERMISSION_DENIED') || firstError.includes('Vertex AI User')) {
          finalError = `Authentication/permission error. Please ensure the 'Vertex AI User' role is set and 'Generative Language API' is enabled in Google Cloud. Details: ${firstError}`;
        } else {
          finalError = `The AI model could not process the provided text. This can happen if the text is empty, contains unsupported characters, or violates content policies. Please review the text and try again. Details: ${firstError}`;
        }
        return { chunksIndexed: 0, sourceId, success: false, error: finalError };
      }
      // This case means the input text was valid but resulted in zero chunks to save, which is a success.
      return { chunksIndexed: 0, sourceId, success: true };
    }

    const batch = writeBatch(db);
    const chunksCollectionRef = collection(db, 'kb_chunks');

    chunksToSave.forEach((chunkData) => {
      const chunkDocRef = doc(chunksCollectionRef);
      batch.set(chunkDocRef, chunkData);
    });

    await batch.commit();

    return { chunksIndexed: chunksToSave.length, sourceId, success: true };
  }
);
