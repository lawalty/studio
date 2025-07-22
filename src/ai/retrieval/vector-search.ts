
'use server';
/**
 * @fileOverview Performs a prioritized, sequential, vector-based semantic search on the knowledge base using Firestore's native vector search.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from the 'kb_chunks' collection in Firestore. It searches 'High' priority documents first,
 *   then 'Medium', then 'Low', then 'Chat History', returning the first set of relevant results it finds that meet a confidence threshold.
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
}

interface SearchParams {
  query: string;
  topic?: string;
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
  const distanceThreshold = 1; // Hardcoded to 1 for testing.
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
          // A smaller distance is a better match. We accept any result where the distance is LESS THAN OR EQUAL to the threshold.
          if (distance <= distanceThreshold) {
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

