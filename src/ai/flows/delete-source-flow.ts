
'use server';
/**
 * @fileOverview A flow to completely delete a knowledge base source, including
 * its metadata, indexed chunks, and the original file from Cloud Storage.
 *
 * - deleteSource - The main function to trigger the deletion process.
 * - DeleteSourceInput - The input type for the function.
 * - DeleteSourceOutput - The return type for the function.
 */
import { z } from 'zod';
import { db, admin } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit';

const DeleteSourceInputSchema = z.object({
  id: z.string().describe('The unique ID of the source document to delete.'),
  level: z.string().describe('The priority level of the source (e.g., High, Medium, Low, Archive).'),
  sourceName: z.string().describe('The original filename of the source document.'),
});
export type DeleteSourceInput = z.infer<typeof DeleteSourceInputSchema>;

const DeleteSourceOutputSchema = z.object({
  success: z.boolean().describe('Indicates whether the deletion was successful.'),
  error: z.string().optional().describe('An error message if the operation failed.'),
});
export type DeleteSourceOutput = z.infer<typeof DeleteSourceOutputSchema>;

const LEVEL_CONFIG_SERVER: Record<string, { collectionName: string }> = {
    'High': { collectionName: 'kb_high_meta_v1' },
    'Medium': { collectionName: 'kb_medium_meta_v1' },
    'Low': { collectionName: 'kb_low_meta_v1' },
    'Archive': { collectionName: 'kb_archive_meta_v1' },
  };

const deleteSourceFlow = ai.defineFlow(
  {
    name: 'deleteSourceFlow',
    inputSchema: DeleteSourceInputSchema,
    outputSchema: DeleteSourceOutputSchema,
  },
  async ({ id, level, sourceName }) => {
    try {
      // 1. Delete all associated chunks from Firestore
      const chunksQuery = db.collection('kb_chunks').where('sourceId', '==', id);
      const chunksSnapshot = await chunksQuery.get();
      if (!chunksSnapshot.empty) {
        const batch = db.batch();
        chunksSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      }

      // 2. Delete the file from Cloud Storage
      const bucket = admin.storage().bucket();
      const storagePath = `knowledge_base_files/${level}/${id}-${sourceName}`;
      const file = bucket.file(storagePath);

      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
      } else {
        console.warn(`[deleteSourceFlow] Storage file not found at path ${storagePath}, but proceeding with Firestore deletion.`);
      }

      // 3. Delete the source metadata document
      const levelConfig = LEVEL_CONFIG_SERVER[level];
      if (!levelConfig) {
        throw new Error(`Invalid level '${level}' provided.`);
      }
      const sourceDocRef = db.collection(levelConfig.collectionName).doc(id);
      await sourceDocRef.delete();

      return { success: true };

    } catch (error: any) {
      console.error(`[deleteSourceFlow] Failed to delete source ${id}:`, error);
      return { success: false, error: error.message || 'An unknown server error occurred during deletion.' };
    }
  }
);

export async function deleteSource(input: DeleteSourceInput): Promise<DeleteSourceOutput> {
  return deleteSourceFlow(input);
}
