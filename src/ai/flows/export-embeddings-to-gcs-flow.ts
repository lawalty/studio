
'use server';
/**
 * @fileOverview A server flow to export all embeddings from the 'kb_chunks'
 * collection in Firestore, format them into the required JSONL format for
 * Vertex AI Vector Search, and upload the resulting file to Google Cloud Storage.
 *
 * - exportEmbeddingsToGcs - The main function to trigger the export process.
 * - ExportEmbeddingsToGcsOutput - The return type for the function.
 */
import { z } from 'zod';
import { db, storage } from '@/lib/firebase-admin';

const ExportEmbeddingsToGcsOutputSchema = z.object({
  success: z.boolean().describe('Indicates whether the export was successful.'),
  error: z.string().optional().describe('An error message if the operation failed.'),
  count: z.number().optional().describe('The number of embeddings exported.'),
  gcsPath: z.string().optional().describe('The full gs:// path to the exported JSONL file.'),
});
export type ExportEmbeddingsToGcsOutput = z.infer<typeof ExportEmbeddingsToGcsOutputSchema>;

export async function exportEmbeddingsToGcs(): Promise<ExportEmbeddingsToGcsOutput> {
  try {
    const chunksSnapshot = await db.collection('kb_chunks').get();
    
    if (chunksSnapshot.empty) {
      return { success: false, error: "No embeddings found in the 'kb_chunks' collection. Please index at least one document first." };
    }

    const embeddingsData = chunksSnapshot.docs.map(doc => {
      const data = doc.data();
      // Vertex AI requires the 'embedding' field to be an array of numbers
      // and the 'id' field to be a string.
      return {
        id: doc.id,
        embedding: data.embedding || [],
      };
    });

    // Convert the array of objects to a JSONL (JSON Lines) string.
    const jsonlString = embeddingsData.map(e => JSON.stringify(e)).join('\n');
    const fileBuffer = Buffer.from(jsonlString, 'utf-8');

    // Define the path in Google Cloud Storage.
    const bucket = storage.bucket();
    const directoryPath = 'vertex-ai-embeddings-export';
    const fileName = `${directoryPath}/embeddings-${new Date().toISOString()}.json`;
    const file = bucket.file(fileName);

    // Upload the file.
    await file.save(fileBuffer, {
      metadata: {
        contentType: 'application/jsonl', // Use jsonl for clarity
      },
    });
    
    // Vertex AI requires the path to the DIRECTORY, not the file.
    const gcsDirectoryPath = `gs://${bucket.name}/${directoryPath}/`;
    
    return {
      success: true,
      count: embeddingsData.length,
      gcsPath: gcsDirectoryPath,
    };

  } catch (error: any) {
    console.error('[exportEmbeddingsToGcs] A critical error occurred during export:', error);
    let detailedError = `An unexpected error occurred during the export process. Please check the server logs. Full error: ${error.message}`;

    if (error.code === 7 || (error.message && (error.message.includes('permission denied') || error.message.includes('IAM')))) {
        detailedError = `CRITICAL: The server failed to read from Firestore or write to Cloud Storage due to a permissions error. Please check the IAM roles for your service account. It needs "Firebase Admin" or both "Cloud Datastore User" and "Storage Object Admin".`;
    }

    return {
      success: false,
      error: detailedError,
    };
  }
}
