'use server';
/**
 * @fileOverview This flow is now DEPRECATED.
 * The new, automated indexing process directly upserts embeddings to Vertex AI
 * via the `indexDocument` flow, making a separate batch export unnecessary.
 * This file is kept for archival purposes but is no longer used by the application.
 */
import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { Storage } from '@google-cloud/storage';

const ExportEmbeddingsToGcsOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  filePath: z.string().optional(),
  documentsExported: z.number().optional(),
});
export type ExportEmbeddingsToGcsOutput = z.infer<typeof ExportEmbeddingsToGcsOutputSchema>;

export async function exportEmbeddingsToGcs(): Promise<ExportEmbeddingsToGcsOutput> {
  const message = "This export flow is deprecated and no longer used. Indexing is now automated.";
  console.warn(`[exportEmbeddingsToGcs] ${message}`);
  return { 
    success: false, 
    message: message 
  };
}
