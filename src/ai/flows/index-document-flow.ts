
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
 * A robust text chunker.
 * It aggressively cleans text to remove non-printable/unsupported characters,
 * then splits the text into chunks by line, combining lines where possible,
 * and force-splitting lines that are too long.
 * @param text The text to chunk.
 * @param chunkSize The target size for each chunk in characters.
 * @returns An array of text chunks.
 */
function chunkText(text: string, chunkSize: number = 1500): string[] {
  // 1. Aggressively clean the text to remove non-printable/control characters.
  // This is a common source of errors for embedding APIs.
  const cleanedText = text
    .replace(/^\uFEFF/, '') // Remove Byte Order Mark (BOM)
    .replace(/[\p{C}]/gu, '') // Remove all Unicode control characters
    .replace(/\r\n/g, '\n') // Normalize line endings
    .trim();

  if (!cleanedText) {
    return [];
  }

  // 2. Split into individual lines. This is a more reliable delimiter than paragraphs.
  const lines = cleanedText.split('\n');
  
  const finalChunks: string[] = [];
  let currentChunk = "";

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) {
        // If we encounter an empty line, and there's content in the current chunk,
        // treat it as a paragraph break and push the chunk.
        if(currentChunk.length > 0) {
            finalChunks.push(currentChunk);
            currentChunk = "";
        }
        continue;
    }

    // 3. If a single line is longer than the chunk size, it must be split.
    if (trimmedLine.length > chunkSize) {
      // First, push any existing content as its own chunk.
      if (currentChunk.length > 0) {
        finalChunks.push(currentChunk);
        currentChunk = "";
      }
      // Then, split the oversized line and add its parts as new chunks.
      for (let i = 0; i < trimmedLine.length; i += chunkSize) {
        finalChunks.push(trimmedLine.substring(i, i + chunkSize));
      }
    } 
    // 4. If adding the next line would make the chunk too big...
    else if ((currentChunk.length + trimmedLine.length + 1) > chunkSize) {
      // ...finalize the current chunk and start a new one with the current line.
      if (currentChunk.length > 0) {
        finalChunks.push(currentChunk);
      }
      currentChunk = trimmedLine;
    } 
    // 5. Otherwise, add the line to the current chunk.
    else {
      currentChunk += (currentChunk.length > 0 ? "\n" : "") + trimmedLine;
    }
  }

  // Add the last remaining chunk if it exists.
  if (currentChunk.length > 0) {
    finalChunks.push(currentChunk);
  }

  return finalChunks.filter(chunk => chunk.trim().length > 0); // Final safety filter
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
