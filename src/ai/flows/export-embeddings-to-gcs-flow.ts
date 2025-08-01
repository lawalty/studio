'use server';
/**
 * @fileOverview This flow exports all document chunks and their embeddings from the
 * Firestore `kb_chunks` collection into a JSONL file in Google Cloud Storage.
 * This file is formatted specifically for batch import into a Vertex AI Vector Search Index.
 *
 * - exportEmbeddingsToGcs - The main function to trigger the export.
 * - ExportEmbeddingsToGcsOutput - The return type for the function.
 */
import { z } from 'zod';
import { db, admin } from '@/lib/firebase-admin';
import { Storage } from '@google-cloud/storage';

const ExportEmbeddingsToGcsOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  filePath: z.string().optional(),
  documentsExported: z.number().optional(),
});
export type ExportEmbeddingsToGcsOutput = z.infer<typeof ExportEmbeddingsToGcsOutputSchema>;

export async function exportEmbeddingsToGcs(): Promise<ExportEmbeddingsToGcsOutput> {
  const { GCLOUD_PROJECT, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET } = process.env;

  if (!GCLOUD_PROJECT || !NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) {
    const errorMsg = 'Missing GCLOUD_PROJECT or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET environment variables.';
    console.error(`[exportEmbeddingsToGcs] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }

  try {
    const chunksSnapshot = await db.collection('kb_chunks').get();
    if (chunksSnapshot.empty) {
      return { success: false, message: 'No document chunks found in Firestore to export.' };
    }

    const jsonlData = chunksSnapshot.docs.map(doc => {
      const data = doc.data();
      // Vertex AI requires a specific JSON format for import.
      // The `id` must be the Firestore document ID.
      // The `embedding` field must contain the vector.
      const line = {
        id: doc.id,
        embedding: data.embedding,
        // You can add optional metadata as 'restricts' for filtering at query time.
        // Here, we'll add some of the source data for potential filtering.
        restricts: [
            {
                namespace: "sourceId",
                allow: [data.sourceId]
            },
            {
                namespace: "level",
                allow: [data.level]
            },
            {
                namespace: "topic",
                allow: [data.topic]
            }
        ]
      };
      return JSON.stringify(line);
    }).join('\n');
    
    const storage = new Storage({ projectId: GCLOUD_PROJECT });
    const bucket = storage.bucket(NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    const fileName = `vertex_ai_export/embeddings_${new Date().toISOString()}.jsonl`;
    const file = bucket.file(fileName);

    await file.save(jsonlData, {
      contentType: 'application/jsonl',
    });
    
    const fullGcsPath = `gs://${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/${fileName}`;

    return {
      success: true,
      documentsExported: chunksSnapshot.size,
      filePath: fullGcsPath,
      message: `Successfully exported ${chunksSnapshot.size} documents to the following GCS file. You can now import this file into your Vertex AI Index.`,
    };

  } catch (error: any) {
    console.error('[exportEmbeddingsToGcs] A critical error occurred:', error);
    return {
      success: false,
      message: `An unexpected error occurred during the export process. Error: ${error.message}`,
    };
  }
}
