
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
import { getFirestore } from 'firebase-admin/firestore';

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
      // Ensure Firebase Admin SDK is initialized using a named instance
      // to prevent conflicts in serverless environments.
      const app = admin.apps.find((a) => a?.name === 'RAG_APP') ||
        admin.initializeApp({
            // Using an explicit project ID can help in some environments.
            // The Admin SDK will still use Application Default Credentials for auth.
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        }, 'RAG_APP');

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

      // Use a batched write for efficiency, using the named app instance.
      const db = getFirestore(app);
      const batch = db.batch();
      const chunksCollection = db.collection('kb_chunks');

      chunks.forEach((chunkText, index) => {
        // Admin SDK syntax for auto-generating a new document ID
        const chunkDocRef = chunksCollection.doc(); 
        batch.set(chunkDocRef, {
          sourceId,
          sourceName,
          level,
          text: chunkText,
          chunkNumber: index + 1,
          createdAt: new Date().toISOString(),
          downloadURL: downloadURL || null,
          // The vector search extension will add the 'embedding' field automatically.
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
      console.error(`[indexDocumentFlow] An unexpected error occurred for source '${sourceName}':`, e);
      let userFriendlyError = `A critical error occurred while writing to Firestore: ${e.message || 'Unknown error'}`;

      const errorMessage = e instanceof Error ? e.message.toLowerCase() : JSON.stringify(e).toLowerCase();
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

      const appHostingSA = projectId
        ? `${projectId}@gcp-sa-apphosting.iam.gserviceaccount.com`
        : 'YOUR_PROJECT_ID@gcp-sa-apphosting.iam.gserviceaccount.com (Could not determine Project ID from environment variables)';
      
      const computeSA = projectId
        ? `${projectId}-compute@developer.gserviceaccount.com`
        : 'YOUR_PROJECT_ID-compute@developer.gserviceaccount.com (Could not determine Project ID from environment variables)';

      if (errorMessage.includes('could not refresh access token') || (errorMessage.includes('getting metadata from plugin failed') && errorMessage.includes('500'))) {
          userFriendlyError = `Indexing failed due to a Google Cloud authentication error. This means the service account for your backend is missing permissions.

ACTION REQUIRED: In your Google Cloud project's "IAM & Admin" page, you must grant the 'Service Account Token Creator' role to the correct principal.

- If you are using Firebase App Hosting (default for this app), the service account is:
  ${appHostingSA}

- If running on Google Compute Engine, the service account is likely:
  ${computeSA}

Please grant the 'Service Account Token Creator' role to the correct service account for your environment.`;
      } else if (errorMessage.includes('permission_denied') || errorMessage.includes('7 permission_denied')) {
          userFriendlyError = `Indexing failed due to a Firestore permissions error. This means the service account can authenticate, but cannot write to the database.

ACTION REQUIRED: In your Google Cloud project's "IAM & Admin" page, ensure the correct service account has the 'Cloud Datastore User' or 'Editor' role.

- If you are using Firebase App Hosting (default for this app), the service account is:
  ${appHostingSA}

- If running on Google Compute Engine, the service account is likely:
  ${computeSA}`;
      } else if (errorMessage.includes('api key not valid')) {
          userFriendlyError = 'The provided GOOGLE_AI_API_KEY is invalid. Please check the key in your .env.local file and ensure it is correct and has "Cloud Firestore API" permissions enabled.';
      }

      return {
        chunksWritten: 0,
        sourceId,
        success: false,
        error: userFriendlyError,
      };
    }
  }
);
