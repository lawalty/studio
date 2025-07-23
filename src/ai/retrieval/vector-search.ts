'use server';
/**
 * @fileOverview Performs a prioritized, sequential, vector-based semantic search on the knowledge base using Firestore's native vector search.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from the 'kb_chunks' collection in Firestore. It fetches a broad set of results
 *   and then filters and prioritizes them in code ('High' -> 'Medium' -> 'Low') to ensure the most important results are returned first.
 */
import { db } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit';

const DEFAULT_DISTANCE_THRESHOLD = 0.6; // Default distance, allows for reasonably similar results.

interface SearchResult {
  sourceId: string;
  text: string;
  sourceName: string;
  level: string;
  topic: string;
  downloadURL?: string;
  distance: number;
  pageNumber?: number;
  title?: string;
  header?: string;
}

interface SearchParams {
  query: string;
  limit?: number;
}

// Helper to get the distance threshold from Firestore. This is now the maximum allowed distance.
async function getDistanceThreshold(): Promise<number> {
    try {
        const docRef = db.collection('configurations').doc('site_display_assets');
        const docSnap = await docRef.get();
        if (docSnap.exists()) {
            const data = docSnap.data();
            const storedThreshold = data?.vectorSearchDistanceThreshold;

            // Handle both array (from slider) and number (direct) data types for robustness.
            if (Array.isArray(storedThreshold) && typeof storedThreshold[0] === 'number') {
                return Math.max(0, Math.min(2, storedThreshold[0]));
            }
            if (typeof storedThreshold === 'number') {
                return Math.max(0, Math.min(2, storedThreshold));
            }
        }
    } catch (error) {
        console.error("Error fetching distance threshold, using default:", error);
    }
    return DEFAULT_DISTANCE_THRESHOLD;
}

export async function searchKnowledgeBase({
  query,
  limit = 5,
}: SearchParams): Promise<SearchResult[]> {
  const embeddingResponse = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: query,
  });

  if (!embeddingResponse || !Array.isArray(embeddingResponse) || embeddingResponse.length === 0 || !embeddingResponse[0].embedding || !Array.isArray(embeddingResponse[0].embedding) || embeddingResponse[0].embedding.length === 0) {
    console.error("[searchKnowledgeBase] Failed to generate a valid embedding for the search query:", query);
    throw new Error("Failed to generate a valid embedding for the search query.");
  }
  
  const embeddingVector = embeddingResponse[0].embedding;
  const distanceThreshold = await getDistanceThreshold();
  
  // 1. Query for a larger set of neighbors from the entire collection first.
  const vectorQuery = db.collection('kb_chunks')
      .findNearest('embedding', embeddingVector, {
          limit: 20, // Fetch more results to allow for filtering/prioritization
          distanceMeasure: 'COSINE'
      });
      
  const snapshot = await vectorQuery.get();
  
  if (snapshot.empty) {
    return [];
  }

  // 2. Filter these results by the distance threshold in code.
  const allValidResults: SearchResult[] = [];
  snapshot.forEach(doc => {
    const distance = (doc as any).distance; 
    // A smaller distance is a better match. We accept any result where the distance is LESS THAN OR EQUAL to the threshold.
    if (distance <= distanceThreshold) {
      allValidResults.push({
        ...(doc.data() as Omit<SearchResult, 'distance'>),
        distance: distance,
      });
    }
  });

  // 3. Sort the filtered results by priority level.
  const priorityOrder: Record<string, number> = { 'High': 1, 'Medium': 2, 'Low': 3, 'Chat History': 4, 'Spanish PDFs': 5, 'Archive': 6 };
  allValidResults.sort((a, b) => {
      const priorityA = priorityOrder[a.level] || 99;
      const priorityB = priorityOrder[b.level] || 99;
      if (priorityA !== priorityB) {
          return priorityA - priorityB;
      }
      // If priorities are the same, sort by distance (closer is better)
      return a.distance - b.distance;
  });

  // 4. Return the top N results based on the original limit.
  return allValidResults.slice(0, limit);
}
