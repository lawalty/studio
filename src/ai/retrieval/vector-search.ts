
'use server';
/**
 * @fileOverview Performs a prioritized, sequential, vector-based semantic search on the knowledge base using Firestore's native vector search.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from the 'kb_chunks' collection in Firestore. It searches 'High' priority documents first,
 *   then 'Medium', then 'Low', then 'Chat History', returning the first set of relevant results it finds.
 */
import { db } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit'; // Ensures Genkit is configured

const PRIORITY_LEVELS: Readonly<('High')[]> = ['High'];

interface SearchResult {
  sourceId: string;
  text: string;
  sourceName: string;
  level: string;
  topic: string;
  downloadURL?: string;
  distance: number;
}

interface SearchParams {
  query: string;
  topic?: string;
  limit?: number;
  distanceThreshold?: number;
}

export async function searchKnowledgeBase({
  query,
  limit = 5,
}: SearchParams): Promise<SearchResult[]> {
  // 1. Generate an embedding for the user's query.
  const embeddingResponse = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: query,
  });

  if (!embeddingResponse || !Array.isArray(embeddingResponse) || embeddingResponse.length === 0 || !embeddingResponse[0].embedding) {
    console.error("[searchKnowledgeBase] Failed to generate a valid embedding for the search query:", query);
    throw new Error("Failed to generate a valid embedding for the search query.");
  }
  const embeddingVector = embeddingResponse[0].embedding;

  // 2. Perform prioritized, sequential search through Firestore.
  for (const level of PRIORITY_LEVELS) {
    try {
      let chunksQuery: FirebaseFirestore.Query = db.collection('kb_chunks');
      
      // We only filter by level for this diagnostic version of the search.
      chunksQuery = chunksQuery.where('level', '==', level);
      
      const vectorQuery = chunksQuery.findNearest('embedding', embeddingVector, {
          limit: limit,
          distanceMeasure: 'COSINE'
      });

      const snapshot = await vectorQuery.get();

      if (snapshot.empty) {
        continue; // Try the next level
      }

      const results: SearchResult[] = [];
      snapshot.forEach(doc => {
        // We are ignoring the distance threshold and returning whatever is found.
        results.push({
            ...(doc.data() as Omit<SearchResult, 'distance'>),
            distance: (doc as any).distance, // Still include the distance for debugging.
        });
      });

      // If we found any results at this priority level, return them immediately.
      if (results.length > 0) {
        return results;
      }

    } catch (error: any) {
        // Log the error but continue to the next priority level.
        console.error(`[searchKnowledgeBase] Error searching in '${level}' priority level:`, error);
    }
  }

  // If the loop completes without finding anything.
  return [];
}
