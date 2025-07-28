
'use server';
/**
 * @fileOverview This flow is now deprecated.
 * This server flow was used to export embeddings to Google Cloud Storage for use with
 * the Vertex AI Vector Search Index. Since the application now uses Firestore's native
 * vector search, this flow is no longer needed and has been disabled to avoid confusion.
 */
import { z } from 'zod';

const ExportEmbeddingsToGcsOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});
export type ExportEmbeddingsToGcsOutput = z.infer<typeof ExportEmbeddingsToGcsOutputSchema>;

export async function exportEmbeddingsToGcs(): Promise<ExportEmbeddingsToGcsOutput> {
  const errorMessage = "This feature is deprecated. The application now uses Firestore's native vector search and no longer requires exporting embeddings to a Vertex AI Index.";
  console.warn(`[exportEmbeddingsToGcs] ${errorMessage}`);
  return {
    success: false,
    error: errorMessage,
  };
}
