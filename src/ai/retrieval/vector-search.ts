
'use server';
/**
 * @fileOverview Performs a prioritized, sequential, vector-based semantic search on the knowledge base using Firestore's native vector search.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from the 'kb_chunks' collection in Firestore. It searches 'High' priority documents first,
 *   then 'Medium', then 'Low', then 'Chat History', returning the first set of relevant results it finds that meet a confidence threshold.
 */
import { db } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit';
import { Embedding } from '@genkit-ai/ai/embedding';

const DEFAULT_DISTANCE_THRESHOLD = 0.85;

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

// Helper to get the distance threshold from Firestore
async function getDistanceThreshold(): Promise<number> {
    try {
        const docRef = db.collection('configurations').doc('site_display_assets');
        const docSnap = await docRef.get();
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (typeof data?.vectorSearchDistanceThreshold === 'number') {
                return data.vectorSearchDistanceThreshold;
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
          // distance is a value from 0 (identical) to 2 (opposite) for COSINE.
          // A smaller distance means a better match.
          const distance = (doc as any).distance; 
          if (distance < distanceThreshold) {
            relevantResults.push({
              ...(doc.data() as Omit<SearchResult, 'distance'>),
              distance: distance,
            });
          }
        });
        
        // If we found relevant results at this level, return them immediately.
        if (relevantResults.length > 0) {
          return relevantResults;
        }
      }
    } catch (error: any) {
        // Log the error for the specific level but continue to the next
        console.error(`[searchKnowledgeBase] Error during vector search for level '${level}':`, error);
    }
  }

  // If no results are found after trying all levels, return an empty array.
  return [];
}
