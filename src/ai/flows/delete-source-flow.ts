
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
    
    // 1. Attempt to delete the file from Cloud Storage.
    // We will log errors but not stop the process, as the goal is to clear the metadata.
    try {
      const bucketName = admin.storage().bucket().name; 
      const storagePath = `knowledge_base_files/${level}/${id}-${sourceName}`;
      const file = admin.storage().bucket(bucketName).file(storagePath);
      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
      } else {
        console.warn(`[deleteSource] Storage file not found, but proceeding with Firestore cleanup: ${storagePath}`);
      }
    } catch (storageError: any) {
      console.error(`[deleteSource] Non-critical error deleting storage file, proceeding with Firestore cleanup. Error:`, storageError);
    }

    // 2. Attempt to delete all Firestore documents. This is the critical part.
    try {
      const batch = db.batch();

      // Delete all associated chunks from 'kb_chunks'
      const chunksQuery = db.collection('kb_chunks').where('sourceId', '==', id);
      const chunksSnapshot = await chunksQuery.get();
      if (!chunksSnapshot.empty) {
        chunksSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
      }

      // Delete the main source metadata document itself.
      const sourceDocRef = db.collection(levelConfig.collectionName).doc(id);
      batch.delete(sourceDocRef);

      // Commit all Firestore deletions at once.
      await batch.commit();

      // Only return success after the Firestore batch has committed successfully.
      return { success: true };

    } catch (firestoreError: any) {
      console.error(`[deleteSource] CRITICAL Firestore error during cleanup for source ${id}:`, firestoreError);
      
      let errorMessage = firestoreError.message || 'An unknown server error occurred during Firestore deletion.';
      
      if (firestoreError.code === 7 || (firestoreError.message && (firestoreError.message.includes('permission denied') || firestoreError.message.includes('IAM')))) {
          errorMessage = `Deletion failed due to a permissions error. The server's service account needs the correct Firestore permissions (e.g., "Cloud Datastore User" or "Firebase Admin") to delete documents. Please check IAM settings in the Google Cloud Console.`
      }

      return { success: false, error: errorMessage };
    }
}
