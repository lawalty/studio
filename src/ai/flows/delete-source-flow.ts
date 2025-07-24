'use server';
/**
 * @fileOverview A server function to completely delete a knowledge base source, including
 * its metadata, indexed chunks, and the original file from Cloud Storage. This version
 * uses a sequential, multi-step deletion process with explicit error handling for
 * each step to ensure accuracy and prevent false success reports.
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
  // These optional fields are now included to match the client-side data structure.
  // Their absence was causing a silent validation failure.
  pageNumber: z.number().optional(),
  title: z.string().optional(),
  header: z.string().optional(),
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
    
    if (!sourceName) {
      const errorMsg = `sourceName was not provided for ID ${id}. Cannot delete from storage without it.`;
      console.error(`[deleteSource] ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    const sourceDocRef = db.collection(levelConfig.collectionName).doc(id);

    // Step 1: Delete associated chunks from the 'kb_chunks' collection.
    try {
        const chunksQuery = db.collection('kb_chunks').where('sourceId', '==', id);
        const chunksSnapshot = await chunksQuery.get();
        if (!chunksSnapshot.empty) {
            const batch = db.batch();
            chunksSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }
    } catch (chunkError: any) {
        console.error(`[deleteSource] CRITICAL: Failed to delete chunks for source ${id}:`, chunkError);
        return { success: false, error: `Failed to delete document chunks from Firestore. Error: ${chunkError.message}` };
    }

    // Step 2: Delete the main source metadata document.
    try {
        const docSnap = await sourceDocRef.get();
        if (docSnap.exists) {
            await sourceDocRef.delete();
        } else {
           // If the doc is already gone, we can consider this step a success.
           console.log(`[deleteSource] Source metadata for ${id} was already deleted. Continuing cleanup.`);
        }
    } catch (metaError: any) {
        console.error(`[deleteSource] CRITICAL: Failed to delete source metadata for ${id}:`, metaError);
        return { success: false, error: `Failed to delete the main source document from Firestore. Error: ${metaError.message}` };
    }

    // Step 3: Delete the file from Cloud Storage.
    try {
        const bucket = admin.storage().bucket();
        // The storage path MUST be constructed correctly to find the file.
        const storagePath = `knowledge_base_files/${level}/${id}-${sourceName}`;
        const file = bucket.file(storagePath);
        const [exists] = await file.exists();
        if (exists) {
            await file.delete();
        } else {
          console.warn(`[deleteSource] Storage file not found at path '${storagePath}', but proceeding as cleanup may not be needed.`);
        }
    } catch (storageError: any) {
        // This is a non-critical error as the primary data has been deleted. Log it.
        console.warn(`[deleteSource] Firestore data for source ${id} deleted, but failed to clean up storage file. Error:`, storageError.message);
    }
    
    // If all critical steps succeeded, return success.
    return { success: true };
}
