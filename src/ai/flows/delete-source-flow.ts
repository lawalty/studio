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
      const errorMsg = `Invalid level '${level}' provided. Cannot determine Firestore collection.`;
      console.error(`[deleteSource] ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
    
    const batch = db.batch();
    const sourceDocRef = db.collection(levelConfig.collectionName).doc(id);

    try {
      // Step 1: Query for all associated chunks and add their deletion to the batch.
      const chunksQuery = db.collection('kb_chunks').where('sourceId', '==', id);
      const chunksSnapshot = await chunksQuery.get();
      if (!chunksSnapshot.empty) {
        chunksSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
      }

      // Step 2: Add the deletion of the main source metadata document to the batch.
      batch.delete(sourceDocRef);

      // Step 3: Commit all Firestore deletions at once. THIS IS THE CRITICAL STEP.
      // If this fails, the function will immediately jump to the catch block.
      await batch.commit();

      // Step 4: After successfully deleting from Firestore, attempt to delete from storage.
      // We will log errors but not fail the entire operation if the file doesn't exist,
      // as the primary goal is to clear the metadata from the UI.
      try {
        const bucket = admin.storage().bucket(); 
        const storagePath = `knowledge_base_files/${level}/${id}-${sourceName}`;
        const file = bucket.file(storagePath);
        const [exists] = await file.exists();
        if (exists) {
          await file.delete();
        }
      } catch (storageError: any) {
        // This is a non-critical error. We've already deleted the metadata.
        console.warn(`[deleteSource] Metadata for source ${id} deleted successfully, but encountered a non-critical error cleaning up the storage file. This can happen if the file was already removed or had a failed upload. Error:`, storageError.message);
      }

      // Only return success after the Firestore batch has committed successfully.
      return { success: true };

    } catch (error: any) {
      // This block will ONLY be entered if the Firestore batch.commit() fails.
      console.error(`[deleteSource] CRITICAL Firestore error during cleanup for source ${id}:`, error);
      
      let errorMessage = 'An unknown server error occurred during Firestore deletion.';
      // Provide specific, actionable error messages for common failures.
      if (error.code === 5) {
          errorMessage = `Deletion failed because the source document could not be found in the '${levelConfig.collectionName}' collection. It might have been already deleted. Please refresh the page.`;
      } else if (error.code === 7 || (error.message && (error.message.includes('permission denied') || error.message.includes('IAM')))) {
          errorMessage = `Deletion failed due to a permissions error. The server's service account needs the correct Firestore permissions (e.g., "Cloud Datastore User" or "Firebase Admin") to delete documents. Please verify IAM settings in the Google Cloud Console.`;
      } else {
          errorMessage = `A server-side Firestore error occurred: ${error.message}`;
      }

      return { success: false, error: errorMessage };
    }
}
