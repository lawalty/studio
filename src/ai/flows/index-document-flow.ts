
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
import { textEmbedding004 } from '@genkit-ai/googleai';
import * as admin from 'firebase-admin';

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
    try {
      if (admin.apps.length === 0) {
        admin.initializeApp();
      }
      const db = admin.firestore();
      
      const cleanText = text.replace(/[^\\x20-\\x7E\\n\\r\\t]/g, '').trim();

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
            config: {
              safetySettings: [
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              ]
            }
          });
          
          const embeddingVector = result.embedding;
          const embeddingAsArray = embeddingVector ? Array.from(embeddingVector) : [];

          if (embeddingAsArray.length > 0) {
            const chunkDocRef = chunksCollectionRef.doc(); // Auto-generate ID
            batch.set(chunkDocRef, {
              sourceId,
              sourceName,
              level,
              text: trimmedChunk,
              embedding: embeddingAsArray,
              createdAt: new Date(),
              downloadURL: downloadURL || null,
            });
            successfulChunks++;
          } else {
            failedChunks++;
            const fullResponse = JSON.stringify(result, null, 2);
            const errorMsg = `The embedding service returned an empty or invalid embedding. This can happen if the API is not enabled or if there's a billing issue. Full response: ${fullResponse}`;
            if (!firstError) firstError = errorMsg;
            console.warn(`[indexDocumentFlow] Skipped a chunk from '${sourceName}' due to empty embedding.`);
          }
        } catch (error: any) {
          failedChunks++;
          let specificError = `The embedding API call failed: ${error.message || 'Unknown error'}.`;
          if (error.message && error.message.includes('403 Forbidden')) {
              specificError = 'The embedding API call was blocked (403 Forbidden). This usually means the "Generative Language API" and/or "Vertex AI API" are not enabled in your Google Cloud project. Please go to your Google Cloud Console, ensure you have the correct project selected, and enable these APIs. Also, verify that billing is enabled for the project.';
          } else if (error.message && error.message.includes('API key not valid')) {
              specificError = 'The provided GOOGLE_AI_API_KEY is not valid. Please check the key in your .env.local file and ensure it is correct.';
          }
          const errorMsg = `${specificError}\n\nThis is the first error encountered. Subsequent chunks may also have failed.`;
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
      
      if (failedChunks > 0) {
          const finalError = `Completed with ${failedChunks} errors. The first error was: ${firstError}`;
          return { chunksCreated: chunks.length, chunksIndexed: successfulChunks, sourceId, success: false, error: finalError };
      }


      return { chunksCreated: chunks.length, chunksIndexed: successfulChunks, sourceId, success: true };
    } catch (e: any) {
      let errorMessage = `A critical error occurred during the indexing process for '${sourceName}': ${e.message || 'Unknown error'}. Please check the server logs for details.`;
       if (e.message && e.message.includes('403 Forbidden')) {
         errorMessage = `A critical error occurred: The API call was blocked (403 Forbidden). This strongly indicates that the "Generative Language API" and/or "Vertex AI API" are not enabled in your Google Cloud project, or billing is not set up. Please verify these settings in your Google Cloud Console.`;
      }
      console.error(`[indexDocumentFlow - CRITICAL] Unhandled exception in flow:`, e);
      return {
        chunksCreated: 0,
        chunksIndexed: 0,
        sourceId,
        success: false,
        error: errorMessage,
      };
    }
  }
);
