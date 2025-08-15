
'use server';
/**
 * @fileoverview A flow to clear all usage statistics by deleting documents
 * from the `chat_sessions` collection in Firestore.
 */
import { z } from 'zod';
import { db } from '@/lib/firebase-admin';

const ClearUsageStatsOutputSchema = z.object({
  success: z.boolean(),
  deletedCount: z.number(),
  error: z.string().optional(),
});
export type ClearUsageStatsOutput = z.infer<typeof ClearUsageStatsOutputSchema>;

const BATCH_SIZE = 400; // Firestore batch limit is 500, use a safe size.

/**
 * Deletes all documents in the 'chat_sessions' collection.
 * This is used to reset all usage statistics on the admin dashboard.
 */
export async function clearUsageStats(): Promise<ClearUsageStatsOutput> {
  console.log("Starting deletion of all documents in 'chat_sessions' collection...");
  const collectionRef = db.collection('chat_sessions');
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
    
    console.log(`Successfully deleted ${deletedCount} documents from 'chat_sessions'.`);
    return {
      success: true,
      deletedCount: deletedCount,
    };
  } catch (error: any) {
    console.error("Error deleting documents from 'chat_sessions':", error);
    return {
      success: false,
      deletedCount: deletedCount,
      error: error.message || 'An unknown error occurred.',
    };
  }
}
