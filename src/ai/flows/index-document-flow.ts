
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
 * A robust text chunker that recursively splits text to respect
 * paragraph and line boundaries as much as possible.
 * @param text The text to chunk.
 * @param chunkSize The target size for each chunk in characters.
 * @returns An array of text chunks.
 */
function chunkText(text: string, chunkSize: number = 1500): string[] {
  // 1. Initial cleaning of the text
  const cleanedText = text
    .replace(/^\uFEFF/, '') // Remove Byte Order Mark (BOM)
    .replace(/\r/g, '')     // Remove all carriage returns
    .replace(/[\p{C}]+/gu, ' ') // Replace control characters with a space
    .replace(/ {2,}/g, ' ') // Collapse multiple spaces
    .trim();

  if (cleanedText.length <= chunkSize) {
    return cleanedText.length > 0 ? [cleanedText] : [];
  }

  // 2. Define splitters in order of preference (from largest to smallest structure)
  const splitters = ['\n\n', '\n', '. ', '? ', '! ', ' '];
  
  function splitRecursively(textToSplit: string, currentSplitters: string[]): string[] {
    if (textToSplit.length <= chunkSize) {
      return [textToSplit];
    }
    if (currentSplitters.length === 0) {
      // Base case: If we've run out of splitters, hard-split the remaining text
      const hardSplits: string[] = [];
      for (let i = 0; i < textToSplit.length; i += chunkSize) {
          hardSplits.push(textToSplit.substring(i, i + chunkSize));
      }
      return hardSplits;
    }

    const currentSplitter = currentSplitters[0];
    const remainingSplitters = currentSplitters.slice(1);
    const parts = textToSplit.split(currentSplitter);
    
    const finalChunks: string[] = [];
    let tempChunk = "";

    for (const part of parts) {
        if (part.trim().length === 0) continue;

        const prospectiveChunk = tempChunk.length > 0 ? tempChunk + currentSplitter + part : part;

        if (prospectiveChunk.length > chunkSize) {
            // If the current tempChunk is not empty, it must be valid. Push it.
            if (tempChunk.length > 0) {
                finalChunks.push(...splitRecursively(tempChunk, remainingSplitters));
            }
            // The new part itself is too long, so we must split it further.
            finalChunks.push(...splitRecursively(part, remainingSplitters));
            tempChunk = ""; // Reset tempChunk
        } else {
            // The prospective chunk is valid, so we can continue building on it.
            tempChunk = prospectiveChunk;
        }
    }
    
    // Add the last remaining tempChunk if it exists
    if (tempChunk.length > 0) {
        finalChunks.push(tempChunk);
    }
    
    return finalChunks;
  }
  
  const chunks = splitRecursively(cleanedText, splitters);

  // Final filter for any empty chunks that might have been created
  return chunks.map(c => c.trim()).filter(chunk => chunk.length > 0);
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
    // 1. Chunk the text
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      console.log(`[indexDocumentFlow] No text chunks found in document '${sourceName}' after cleaning. Skipping indexing.`);
      return { chunksIndexed: 0, sourceId };
    }

    // 2. Generate embeddings and prepare data for Firestore.
    // This approach is more resilient, skipping chunks that fail to embed.
    const chunksToSave: any[] = [];
    let failedChunks = 0;

    for (const chunk of chunks) {
      try {
        const { embedding } = await ai.embed({
          embedder: 'googleai/text-embedding-004',
          content: chunk,
        });

        if (embedding) {
          chunksToSave.push({
            sourceId,
            sourceName,
            level,
            text: chunk,
            embedding: embedding,
            createdAt: new Date().toISOString(),
            downloadURL,
          });
        } else {
          // This case handles when the embedding model returns no embedding without an error.
          failedChunks++;
          console.warn(
            `[indexDocumentFlow] Skipped a chunk from '${sourceName}' because it failed to generate an embedding. The chunk may be empty or contain unsupported content. Content: "${chunk.substring(0, 100)}..."`
          );
        }
      } catch (error: any) {
        // This case handles when the embedding call itself throws an exception.
        failedChunks++;
        console.error(
          `[indexDocumentFlow] Error embedding a chunk from '${sourceName}'. Skipping chunk. Error: ${error.message}. Content: "${chunk.substring(0, 100)}..."`
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
          throw new Error(`Failed to index '${sourceName}'. All ${failedChunks} text chunks in the document were invalid or unsupported by the embedding model.`);
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
