
'use server';
/**
 * @fileOverview A server function to completely delete a knowledge base source, including
 * its metadata, indexed chunks from the 'kb_chunks' subcollection, and the original 
 * file from Cloud Storage.
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

export async function deleteSource({ id, level, sourceName }: DeleteSourceInput): Promise<DeleteSourceOutput> {
    if (!sourceName) {
      const errorMsg = `sourceName was not provided for ID ${id}. Cannot delete from storage without it.`;
      console.error(`[deleteSource] ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    const sourceDocRef = db.collection('kb_meta').doc(id);
    const chunksCollectionRef = sourceDocRef.collection('kb_chunks');

    // Step 1: Delete associated chunks from the subcollection.
    try {
        const chunksSnapshot = await chunksCollectionRef.get();
        if (!chunksSnapshot.empty) {
            const batch = db.batch();
            chunksSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }
    } catch (chunkError: any) {
        console.error(`[deleteSource] CRITICAL: Failed to query or delete chunks for source ${id}:`, chunkError);
        return { success: false, error: `Failed to delete chunks from the database. Error: ${chunkError.message}` };
    }

    // Step 2: Delete the main source metadata document.
    try {
        await sourceDocRef.delete();
    } catch (metaError: any) {
        console.error(`[deleteSource] CRITICAL: Failed to delete source metadata for ${id}:`, metaError);
        return { success: false, error: `Failed to delete the main source document from Firestore. Error: ${metaError.message}` };
    }

    // Step 3: Delete the file from Cloud Storage.
    try {
        const bucket = admin.storage().bucket();
        const storagePath = `knowledge_base_files/${level}/${id}-${sourceName}`;
        const file = bucket.file(storagePath);
        const [exists] = await file.exists();
        if (exists) {
            await file.delete();
        } else {
          console.warn(`[deleteSource] Storage file not found at path '${storagePath}', but proceeding as this may not be an error.`);
        }
    } catch (storageError: any) {
        console.warn(`[deleteSource] Firestore data for source ${id} deleted, but failed to clean up storage file. This may require manual cleanup in Cloud Storage. Error:`, storageError.message);
    }
    
    return { success: true };
}
