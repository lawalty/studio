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
import { getFirestore } from 'firebase-admin/firestore'; // Using Admin SDK
import { textEmbedding004 } from '@genkit-ai/googleai';

// Initialize Admin Firestore. Genkit's Firebase plugin handles app initialization.
const db = getFirestore();

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
    
    const batch = db.batch();
    const chunksCollectionRef = db.collection('kb_chunks');
    let successfulChunks = 0;
    let failedChunks = 0;
    let firstError: string | null = null;

    for (const chunk of chunks) {
      try {
        const trimmedChunk = chunk.trim();
        if (trimmedChunk.length === 0) {
          continue;
        }
        
        const result = await ai.embed({
          embedder: textEmbedding004,
          content: trimmedChunk,
          taskType: 'RETRIEVAL_DOCUMENT',
        });
        
        const embeddingVector = result.embedding;

        if (embeddingVector && typeof embeddingVector.length === 'number' && embeddingVector.length > 0) {
          const chunkDocRef = chunksCollectionRef.doc(); // Auto-generate ID
          batch.set(chunkDocRef, {
            sourceId,
            sourceName,
            level,
            text: trimmedChunk,
            embedding: Array.from(embeddingVector), // Convert Float32Array to regular Array
            createdAt: new Date(), // Use JS Date object, Firestore converts to Timestamp
            downloadURL,
          });
          successfulChunks++;
        } else {
          failedChunks++;
          const errorMsg = `The embedding service returned an empty or invalid embedding.`;
          if (!firstError) firstError = errorMsg;
          console.warn(`[indexDocumentFlow] Skipped a chunk from '${sourceName}' due to empty embedding.`);
        }
      } catch (error: any) {
        failedChunks++;
        const errorMsg = `The embedding API call failed: ${error.message || 'Unknown error'}.`;
        if (!firstError) firstError = errorMsg;
        console.error(`[indexDocumentFlow] Error embedding a chunk from '${sourceName}'.`, error);
      }
    }
    
    if (successfulChunks > 0) {
        await batch.commit();
    }

    if (failedChunks > 0 && successfulChunks === 0) {
        const finalError = `Failed to embed any chunks for '${sourceName}'. The first error was: ${firstError}`;
        return { chunksCreated: chunks.length, chunksIndexed: 0, sourceId, success: false, error: finalError };
    }

    return { chunksCreated: chunks.length, chunksIndexed: successfulChunks, sourceId, success: true };
  }
);