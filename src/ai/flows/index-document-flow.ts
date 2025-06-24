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
 * A simple text chunker.
 * It splits text by paragraphs first, then combines them into chunks of a target size.
 * @param text The text to chunk.
 * @param chunkSize The target size for each chunk in characters.
 * @returns An array of text chunks.
 */
function chunkText(text: string, chunkSize: number = 1500): string[] {
  const paragraphs = text.split(/(\n\s*){2,}/).filter(p => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 1 > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = '';
    }
    // If a single paragraph is larger than the chunk size, it becomes its own chunk.
    if (paragraph.length > chunkSize) {
       if (currentChunk.length > 0) {
         chunks.push(currentChunk);
         currentChunk = '';
       }
       chunks.push(paragraph);
    } else {
      currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + paragraph;
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
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
    // 1. Chunk the text
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return { chunksIndexed: 0, sourceId };
    }

    // 2. Generate embeddings for each chunk individually to avoid batching issues.
    const embeddings: number[][] = [];
    for (const chunk of chunks) {
      const { embedding } = await ai.embed({
        embedder: 'googleai/text-embedding-004',
        content: chunk,
      });

      // FIX: Check for undefined embedding and throw a clear error.
      // This prevents the Firestore error "Unsupported field value: undefined".
      if (!embedding) {
        throw new Error(
          `Failed to generate embedding for a chunk in document '${sourceName}'. The chunk may be empty or contain unsupported content.`
        );
      }
      embeddings.push(embedding);
    }

    if (embeddings.length !== chunks.length) {
      throw new Error('Mismatch between number of chunks and generated embeddings.');
    }

    // 3. Save to Firestore in a batch
    const batch = writeBatch(db);
    const chunksCollectionRef = collection(db, 'kb_chunks');

    embeddings.forEach((embedding, index) => {
      const chunkDocRef = doc(chunksCollectionRef); // Auto-generates ID for each chunk
      batch.set(chunkDocRef, {
        sourceId,
        sourceName,
        level,
        text: chunks[index],
        embedding: embedding, // This is now guaranteed to be a valid array.
        createdAt: new Date().toISOString(),
        downloadURL,
      });
    });

    await batch.commit();

    return { chunksIndexed: chunks.length, sourceId };
  }
);
