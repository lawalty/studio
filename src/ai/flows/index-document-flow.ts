
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
 * normalizes whitespace and line endings, then splits the text into chunks
 * by paragraph, respecting a maximum chunk size.
 * @param text The text to chunk.
 * @param chunkSize The target size for each chunk in characters.
 * @returns An array of text chunks.
 */
function chunkText(text: string, chunkSize: number = 1500): string[] {
  // 1. Aggressively clean the text to remove non-printable characters, weird whitespace, and control chars.
  // This is a common source of errors for embedding APIs.
  // We keep letters, numbers, standard punctuation, and basic whitespace.
  const cleanedText = text
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\r\n]/gu, '') // Remove non-standard characters
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/(\n\s*){2,}/g, '\n\n') // Collapse multiple newlines to a standard paragraph break
    .trim();

  if (!cleanedText) {
    return [];
  }

  // 2. Split into paragraphs. This is a safer primary delimiter.
  const paragraphs = cleanedText.split('\n\n');
  
  const finalChunks: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (trimmedParagraph.length === 0) {
      continue; // Skip empty paragraphs
    }

    // 3. If a paragraph is larger than the chunk size, split it by force.
    if (trimmedParagraph.length > chunkSize) {
      for (let i = 0; i < trimmedParagraph.length; i += chunkSize) {
        const subChunk = trimmedParagraph.substring(i, i + chunkSize).trim();
        if (subChunk.length > 0) {
          finalChunks.push(subChunk);
        }
      }
    } else {
      // 4. Otherwise, the paragraph is a valid chunk on its own.
      finalChunks.push(trimmedParagraph);
    }
  }

  return finalChunks;
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
