
'use server';
/**
 * @fileOverview A server function to completely delete a knowledge base source, including
 * its metadata, indexed chunks, and the original file from Cloud Storage. This version
 * prioritizes deleting Firestore data first and has robust error handling to prevent
 * false success reports.
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
      const errorMsg = `Invalid level '${level}' provided. Cannot determine Firestore collection.`;
      console.error(`[deleteSource] ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
    
    const sourceDocRef = db.collection(levelConfig.collectionName).doc(id);

    try {
      // Step 1: Prioritize deleting all Firestore documents in a single batch.
      const batch = db.batch();

      // Add the main metadata document to the batch for deletion.
      batch.delete(sourceDocRef);

      // Query for all associated chunks and add their deletions to the batch.
      const chunksQuery = db.collection('kb_chunks').where('sourceId', '==', id);
      const chunksSnapshot = await chunksQuery.get();
      if (!chunksSnapshot.empty) {
        chunksSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
      }

      // Step 2: Commit the Firestore batch. This is the most critical operation.
      // If this fails, the function will immediately jump to the catch block.
      await batch.commit();

      // Step 3: AFTER successful Firestore deletion, attempt to delete from storage.
      // This is a non-critical cleanup. We will log errors but not fail the whole operation.
      try {
        const bucket = admin.storage().bucket(); 
        const storagePath = `knowledge_base_files/${level}/${id}-${sourceName}`;
        const file = bucket.file(storagePath);
        const [exists] = await file.exists();
        if (exists) {
          await file.delete();
        }
      } catch (storageError: any) {
        // This is a non-critical error. The UI entry is already gone.
        console.warn(`[deleteSource] Firestore metadata for source ${id} deleted successfully, but encountered a non-critical error cleaning up the storage file. Error:`, storageError.message);
      }

      // Only return success after the Firestore batch has committed successfully.
      return { success: true };

    } catch (error: any) {
      // This block will ONLY be entered if the Firestore batch.commit() fails.
      console.error(`[deleteSource] CRITICAL Firestore error during deletion for source ${id}:`, error);
      
      let errorMessage = 'An unknown server error occurred during Firestore deletion.';
      if (error.code === 5) { // NOT_FOUND
          errorMessage = `Deletion failed because the source document could not be found in the '${levelConfig.collectionName}' collection. It might have been already deleted. Please refresh the page.`;
      } else if (error.code === 7) { // PERMISSION_DENIED
          errorMessage = `Deletion failed due to a permissions error. The server needs the correct IAM permissions (e.g., "Cloud Datastore User" or "Firebase Admin") to delete documents. Please verify IAM settings in the Google Cloud Console.`;
      } else {
          errorMessage = `A server-side Firestore error occurred: ${error.message}`;
      }

      return { success: false, error: errorMessage };
    }
}
