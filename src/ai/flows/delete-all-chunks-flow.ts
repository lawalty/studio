'use server';
/**
 * @fileoverview A flow to delete all documents from a specified Firestore collection.
 * This is a utility for clearing out collections like 'kb_chunks' before re-indexing.
 */
import { z } from 'zod';
import { db } from '@/lib/firebase-admin';

const DeleteAllChunksInputSchema = z.object({
  // Optional: You could add a confirmation string to prevent accidental runs.
  // confirm: z.literal('delete all chunks'),
});

const DeleteAllChunksOutputSchema = z.object({
  success: z.boolean(),
  deletedCount: z.number(),
  error: z.string().optional(),
});

export type DeleteAllChunksInput = z.infer<typeof DeleteAllChunksInputSchema>;
export type DeleteAllChunksOutput = z.infer<typeof DeleteAllChunksOutputSchema>;

const BATCH_SIZE = 400; // Firestore batch limit is 500, use a safe size.

/**
 * Deletes all documents in the 'kb_chunks' collection.
 */
export async function deleteAllChunks(input: DeleteAllChunksInput): Promise<DeleteAllChunksOutput> {
  console.log("Starting deletion of all documents in 'kb_chunks' collection...");
  const collectionRef = db.collection('kb_chunks');
  let deletedCount = 0;

  try {
    let query = collectionRef.limit(BATCH_SIZE);
    let snapshot;

    while (true) {
      snapshot = await query.get();
      if (snapshot.size === 0) {
        break; // No more documents to delete
      }

      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      deletedCount += snapshot.size;
      console.log(`Deleted a batch of ${snapshot.size} documents. Total deleted: ${deletedCount}`);

      if (snapshot.size < BATCH_SIZE) {
        break; // Last batch was smaller than the limit, so we're done.
      }
    }
    
    console.log(`Successfully deleted ${deletedCount} documents from 'kb_chunks'.`);
    return {
      success: true,
      deletedCount: deletedCount,
    };
  } catch (error: any) {
    console.error("Error deleting documents from 'kb_chunks':", error);
    return {
      success: false,
      deletedCount: deletedCount,
      error: error.message || 'An unknown error occurred.',
    };
  }
}
