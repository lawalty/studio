
'use server';
/**
 * @fileOverview Performs a prioritized, sequential, vector-based semantic search on the knowledge base using Firestore's native vector search.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from the 'kb_chunks' collection in Firestore. It searches 'High' priority documents first,
 *   then 'Medium', then 'Low', then 'Chat History', returning the first set of relevant results it finds that meet a confidence threshold.
 */
import { db } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit';

const DEFAULT_SIMILARITY_THRESHOLD = 0.4; // Corresponds to a cosine distance of 0.6

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
}

// Helper to get the relevance threshold from Firestore
async function getRelevanceThreshold(): Promise<number> {
    try {
        const docRef = db.collection('configurations').doc('site_display_assets');
        const docSnap = await docRef.get();
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (typeof data?.vectorSearchDistanceThreshold === 'number') {
                // Ensure the value is within a reasonable range (0 to 1)
                const threshold = Math.max(0, Math.min(1, data.vectorSearchDistanceThreshold));
                return threshold;
            }
        }
    } catch (error) {
        console.error("Error fetching relevance threshold, using default:", error);
    }
    return DEFAULT_SIMILARITY_THRESHOLD;
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
  // CORRECTED: The call to getRelevanceThreshold is now properly awaited.
  const relevanceThreshold = await getRelevanceThreshold();
  // We invert the slider's value. A higher "relevance" score from the user (e.g., 0.8) means we need a smaller "distance" (e.g., < 0.2).
  const distanceThreshold = 1 - relevanceThreshold;
  const searchLevels: string[] = ['High', 'Medium', 'Low', 'Chat History'];

  for (const level of searchLevels) {
    try {
      const vectorQuery = db.collection('kb_chunks')
          .where('level', '==', level)
          .findNearest('embedding', embeddingVector, {
              limit: limit,
              distanceMeasure: 'COSINE'
          });
          
      const snapshot = await vectorQuery.get();
      
      if (!snapshot.empty) {
        const relevantResults: SearchResult[] = [];
        snapshot.forEach(doc => {
          const distance = (doc as any).distance; 
          // A smaller distance means a better match. We compare it to our calculated threshold.
          if (distance < distanceThreshold) {
            relevantResults.push({
              ...(doc.data() as Omit<SearchResult, 'distance'>),
              distance: distance,
            });
          }
        });
        
        if (relevantResults.length > 0) {
          return relevantResults;
        }
      }
    } catch (error: any) {
        console.error(`[searchKnowledgeBase] Error during vector search for level '${level}':`, error);
        // Continue to the next level if one fails
    }
  }

  // If no results are found in any level, return an empty array.
  return [];
}
