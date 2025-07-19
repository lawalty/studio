'use server';
/**
 * @fileOverview Performs a prioritized, sequential, vector-based semantic search on the knowledge base using Firestore's native vector search.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from the 'kb_chunks' collection in Firestore. It searches 'High' priority documents first,
 *   then 'Medium', then 'Low', then 'Chat History', returning the first set of relevant results it finds that meet a confidence threshold.
 */
import { db } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit'; // Ensures Genkit is configured

const PRIORITY_LEVELS: Readonly<('High' | 'Medium' | 'Low' | 'Chat History')[]> = ['High', 'Medium', 'Low', 'Chat History'];

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
  distanceThreshold?: number; // This is kept for the test harness but not used for filtering here.
}

// Fetches the dynamic distance threshold from Firestore.
async function getDistanceThreshold(): Promise<number> {
    const DEFAULT_THRESHOLD = 0.85;
    try {
        const configDocRef = db.collection('configurations').doc('site_display_assets');
        const docSnap = await configDocRef.get();
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Ensure the value is a number and within a reasonable range (0 to 1.5)
            if (typeof data?.vectorSearchDistanceThreshold === 'number') {
                const threshold = data.vectorSearchDistanceThreshold;
                return Math.max(0, Math.min(1.5, threshold));
            }
        }
        return DEFAULT_THRESHOLD;
    } catch (error) {
        console.error("[getDistanceThreshold] Could not fetch from Firestore, using default.", error);
        return DEFAULT_THRESHOLD;
    }
}


export async function searchKnowledgeBase({
  query,
  topic,
  limit = 5,
  distanceThreshold, // No longer used for filtering, but kept for API consistency.
}: SearchParams): Promise<SearchResult[]> {
  // 1. Generate an embedding for the user's query.
  const embeddingResponse = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: query,
  });

  if (!embeddingResponse || !Array.isArray(embeddingResponse) || embeddingResponse.length === 0 || !embeddingResponse[0].embedding || !Array.isArray(embeddingResponse[0].embedding)) {
    console.error("[searchKnowledgeBase] Failed to generate a valid embedding for the search query:", query);
    throw new Error("Failed to generate a valid embedding for the search query.");
  }
  const embeddingVector = embeddingResponse[0].embedding;

  // 2. Perform prioritized, sequential search through Firestore.
  for (const level of PRIORITY_LEVELS) {
    try {
      let chunksQuery: FirebaseFirestore.Query = db.collection('kb_chunks');
      
      chunksQuery = chunksQuery.where('level', '==', level);

      if (topic) {
        chunksQuery = chunksQuery.where('topic', '==', topic);
      }
      
      // Let Firestore do the work of finding the closest matches.
      // We are removing the manual distance check, as findNearest already returns the top N results.
      const vectorQuery = chunksQuery.findNearest('embedding', embeddingVector, {
          limit: limit,
          distanceMeasure: 'COSINE'
      });

      const snapshot = await vectorQuery.get();

      if (snapshot.empty) {
        continue; // Try the next level
      }

      // If we get here, it means Firestore found at least one result in this priority level.
      // We will return these results immediately without further filtering.
      const relevantResults: SearchResult[] = [];
      snapshot.forEach(doc => {
        // We still capture the distance for logging or potential future use, but we don't filter by it.
        const distance = (doc as any).distance; 
        relevantResults.push({
          ...(doc.data() as Omit<SearchResult, 'distance'>),
          distance: distance,
        });
      });

      if (relevantResults.length > 0) {
        return relevantResults; // Return the first set of relevant results found.
      }

    } catch (error: any) {
        console.error(`[searchKnowledgeBase] Error searching in '${level}' priority level:`, error);
    }
  }

  // If the loop completes without finding any results in any priority level.
  return [];
}
