'use server';
/**
 * @fileOverview A temporary, isolated flow for testing basic upload and delete functionality.
 * This is used to diagnose fundamental issues with Firestore/Storage permissions.
 *
 * - uploadTestFile - Creates a simple text file and metadata document.
 * - deleteTestFile - Deletes the test file and its metadata.
 */
import { z } from 'zod';
import { db, admin } from '@/lib/firebase-admin';
import { v4 as uuidv4 } from 'uuid';

// --- Upload Logic ---
const UploadTestFileOutputSchema = z.object({
  id: z.string().describe('The ID of the created document.'),
  message: z.string().describe('A success message.'),
  error: z.string().optional().describe('An error message if it failed.'),
});
export type UploadTestFileOutput = z.infer<typeof UploadTestFileOutputSchema>;

export async function uploadTestFile(): Promise<UploadTestFileOutput> {
  const id = uuidv4();
  const fileName = `test-file-${id}.txt`;
  const storagePath = `temp_kb_storage/${fileName}`;
  const firestoreRef = db.collection('temp_kb_database').doc(id);

  try {
    // 1. Create file content
    const fileContent = `This is a test file created at ${new Date().toISOString()}`;
    const buffer = Buffer.from(fileContent, 'utf8');

    // 2. Upload to storage
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);
    await file.save(buffer, {
      metadata: { contentType: 'text/plain' },
    });
    const [downloadURL] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });

    // 3. Write metadata to Firestore
    await firestoreRef.set({
      id,
      fileName,
      storagePath,
      downloadURL,
      createdAt: new Date().toISOString(),
    });

    return { id, message: `Successfully created test file with ID: ${id}` };
  } catch (error: any) {
    console.error('[uploadTestFile] Error:', error);
    return { id, message: '', error: `Upload failed: ${error.message}` };
  }
}

// --- Delete Logic ---
const DeleteTestFileInputSchema = z.object({
  id: z.string().describe('The ID of the test document to delete.'),
});
export type DeleteTestFileInput = z.infer<typeof DeleteTestFileInputSchema>;

const DeleteTestFileOutputSchema = z.object({
  message: z.string().describe('A success or failure message.'),
  error: z.string().optional().describe('An error message if it failed.'),
});
export type DeleteTestFileOutput = z.infer<typeof DeleteTestFileOutputSchema>;

export async function deleteTestFile({ id }: DeleteTestFileInput): Promise<DeleteTestFileOutput> {
  if (!id) {
    return { message: '', error: 'No test file ID was provided.' };
  }
  const firestoreRef = db.collection('temp_kb_database').doc(id);

  try {
    // 1. Get the doc to find the storage path
    const docSnap = await firestoreRef.get();
    if (!docSnap.exists) {
      // If doc is already gone, consider it a success for cleanup purposes
      return { message: `Document with ID ${id} not found in Firestore. Assumed already deleted.` };
    }
    const data = docSnap.data();
    const storagePath = data?.storagePath;

    // 2. Delete the Firestore document FIRST. This is the most critical step.
    await firestoreRef.delete();

    // 3. Delete the file from storage if a path was found.
    if (storagePath) {
      try {
        const bucket = admin.storage().bucket();
        const file = bucket.file(storagePath);
        await file.delete();
      } catch (storageError: any) {
        // Log this, but don't fail the whole operation since Firestore doc is gone
        console.warn(`[deleteTestFile] Firestore doc ${id} deleted, but storage file failed to delete:`, storageError.message);
      }
    }

    return { message: `Successfully deleted test file and metadata for ID: ${id}` };

  } catch (error: any) {
    console.error('[deleteTestFile] Error:', error);
    // This will now catch permission errors from the firestoreRef.delete() call
    return { message: '', error: `Deletion failed: ${error.message}` };
  }
}
