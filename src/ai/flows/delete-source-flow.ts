'use server';
/**
 * @fileOverview A server function to completely delete a knowledge base source, including
 * its metadata, indexed chunks, and the original file from Cloud Storage.
 *
 * - deleteSource - The main function to trigger the deletion process.
 * - DeleteSourceInput - The input type for the function.
 * - DeleteSourceOutput - The return type for the function.
 */
import { z } from 'zod';
import { db, admin } from '@/lib/firebase-admin';

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
    'Spanish PDFs': { collectionName: 'kb_spanish_pdfs_meta_v1' },
    'Chat History': { collectionName: 'kb_chat_history_meta_v1' },
    'Archive': { collectionName: 'kb_archive_meta_v1' },
  };

export async function deleteSource({ id, level, sourceName }: DeleteSourceInput): Promise<DeleteSourceOutput> {
    const levelConfig = LEVEL_CONFIG_SERVER[level];
    if (!levelConfig) {
      return { success: false, error: `Invalid level '${level}' provided.` };
    }
    
    try {
      // 1. Delete the file from Cloud Storage first.
      const bucketName = admin.storage().bucket().name; // Get the correctly configured bucket name
      if (!bucketName) {
        throw new Error("CRITICAL: Firebase Storage bucket name could not be determined from the Admin SDK.");
      }
      const bucket = admin.storage().bucket(bucketName);
      // The path construction now matches the upload path logic exactly.
      const storagePath = `knowledge_base_files/${level}/${id}-${sourceName}`;
      const file = bucket.file(storagePath);

      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
      } else {
        // If file doesn't exist, we can still proceed to clean up Firestore.
        // This handles "zombie" metadata where the file was already deleted.
        console.warn(`[deleteSource] Storage file not found at path ${storagePath}, proceeding with Firestore cleanup.`);
      }

      // 2. Delete all associated chunks from Firestore's 'kb_chunks' collection.
      const chunksQuery = db.collection('kb_chunks').where('sourceId', '==', id);
      const chunksSnapshot = await chunksQuery.get();
      const batch = db.batch(); // Use a single batch for all Firestore deletions.
      if (!chunksSnapshot.empty) {
        chunksSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
      }

      // 3. Delete the source metadata document.
      const sourceDocRef = db.collection(levelConfig.collectionName).doc(id);
      batch.delete(sourceDocRef);

      // 4. Commit all Firestore deletions at once.
      await batch.commit();

      return { success: true };

    } catch (error: any) {
      console.error(`[deleteSource] Failed to delete source ${id}:`, error);
      let errorMessage = error.message || 'An unknown server error occurred during deletion.';
      
      // Provide more specific feedback for common permission errors.
      if (error.code === 403 || (error.message && error.message.includes('permission denied'))) {
          errorMessage = `Deletion failed due to a permissions error. The server's service account needs the "Storage Object Admin" role to delete files from Cloud Storage. Please check IAM settings.`
      }

      return { success: false, error: errorMessage };
    }
}
