
import { ai } from '@/ai/genkit';
import { deleteSource } from './delete-source-flow';
import { z } from 'zod';
import { db } from '@/lib/firebase-admin';

export const selfDestructSchema = z.object({});

ai.defineFlow(
  {
    name: 'selfDestructFlow',
    inputSchema: selfDestructSchema,
    outputSchema: z.any(),
  },
  async () => {
    const kbChunks = await db.collection('kb_chunks').get();
    const promises = [];
    for (const doc of kbChunks.docs) {
      const data = doc.data();
      if (!data) {
        const sourceId = doc.id;
        const sourceName = 'unknown';
        const level = 'unknown';
        promises.push(deleteSource({ id: sourceId, sourceName, level }));
      }
    }
    await Promise.all(promises);
  }
);
