'use server';
/**
 * @fileOverview A flow to index a document by chunking its text and writing
 * the chunks to Firestore, where a vector search extension will handle embedding.
 *
 * - indexDocument - Chunks text and writes it to Firestore.
 * - IndexDocumentInput - The input type for the function.
 * - IndexDocumentOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import * as admin from 'firebase-admin';

const IndexDocumentInputSchema = z.object({
  sourceId: z.string().describe('The unique ID of the source document.'),
  sourceName: z.string().describe('The original filename of the source document.'),
  text: z.string().describe('The full text content of the document to be indexed.'),
  level: z.string().describe('The priority level of the knowledge base (e.g., High, Medium).'),
  downloadURL: z.string().url().optional().describe('The public downloadURL for the source file.'),
});
export type IndexDocumentInput = z.infer<typeof IndexDocumentInputSchema>;

const IndexDocumentOutputSchema = z.object({
  chunksWritten: z.number().describe('The number of text chunks written to Firestore.'),
  sourceId: z.string().describe('The unique ID of the source document that was processed.'),
  success: z.boolean().describe('Indicates whether the operation completed without errors.'),
  error: z.string().optional().describe('An error message if the operation failed.'),
});
export type IndexDocumentOutput = z.infer<typeof IndexDocumentOutputSchema>;

export async function indexDocument(input: IndexDocumentInput): Promise<IndexDocumentOutput> {
  return indexDocumentFlow(input);
}

// A simple text splitter function.
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
      
      const cleanText = text.trim();
      if (!cleanText) {
         const errorMessage = "No readable text content was found in the document. Aborting indexing.";
         console.warn(`[indexDocumentFlow] ${errorMessage} Document: '${sourceName}'.`);
         return { chunksWritten: 0, sourceId, success: false, error: errorMessage };
      }
      
      const chunks = simpleSplitter(cleanText, {
        chunkSize: 1500, // A reasonable size for embedding models
        chunkOverlap: 150,
      });

      if (chunks.length === 0) {
        return { chunksWritten: 0, sourceId, success: true };
      }

      console.log(`[indexDocumentFlow] Writing ${chunks.length} chunks for source '${sourceName}' to Firestore.`);

      const db = admin.firestore();
      const batch = db.batch();
      const chunksCollection = db.collection('kb_chunks');

      chunks.forEach((chunkText, index) => {
        const chunkDocRef = chunksCollection.doc(); 
        batch.set(chunkDocRef, {
          sourceId,
          sourceName,
          level,
          text: chunkText,
          chunkNumber: index + 1,
          createdAt: new Date().toISOString(),
          downloadURL: downloadURL || null,
        });
      });

      await batch.commit();

      console.log(`[indexDocumentFlow] Successfully wrote ${chunks.length} chunks for source '${sourceName}'.`);

      return {
        chunksWritten: chunks.length,
        sourceId,
        success: true,
      };

    } catch (e: any) {
      console.error(`[indexDocumentFlow] Raw error for source '${sourceName}':`, e);
      let detailedError = `Indexing failed for an unknown reason. Please check the logs.`;
      const rawError = e instanceof Error ? e.message : JSON.stringify(e);
      
      if (e.message && (e.message.includes('permission denied') || e.message.includes('IAM') || e.code === 7)) {
          detailedError = `Indexing failed due to a permissions issue. Please check that the App Hosting service account has the required IAM roles (e.g., Firestore User, Vertex AI User) and that the necessary Google Cloud APIs are enabled. Full technical error: ${rawError}`;
      } else {
          detailedError = `Indexing failed. This may be due to a configuration or service issue. Full technical error: ${rawError}`;
      }

      return {
        chunksWritten: 0,
        sourceId,
        success: false,
        error: detailedError,
      };
    }
  }
);
