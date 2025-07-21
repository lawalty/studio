
'use server';
/**
 * @fileOverview Performs a prioritized, sequential, vector-based semantic search on the knowledge base using Firestore's native vector search.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from the 'kb_chunks' collection in Firestore. It searches 'High' priority documents first,
 *   then 'Medium', then 'Low', then 'Chat History', returning the first set of relevant results it finds that meet a confidence threshold.
 */
import { db } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit';

const DEFAULT_DISTANCE_THRESHOLD = 0.85;
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
}

// Helper to get the distance threshold from Firestore
async function getDistanceThreshold(): Promise<number> {
    try {
        const docRef = db.collection('configurations').doc('site_display_assets');
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            const data = docSnap.data();
            if (typeof data?.vectorSearchDistanceThreshold === 'number') {
                return data.vectorSearchDistanceThreshold;
            }
        }
    } catch (error) {
        console.error("Error fetching distance threshold, using default:", error);
    }
    // This default is a safe fallback ONLY if the Firestore document/field is missing.
    // The main search logic relies on this function to provide the authoritative value.
    return DEFAULT_DISTANCE_THRESHOLD;
}


export async function searchKnowledgeBase({
  query,
  topic,
  limit = 5,
}: SearchParams): Promise<SearchResult[]> {
  const embeddingResponse = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: query,
  });
  
  if (!embeddingResponse || !Array.isArray(embeddingResponse) || embeddingResponse.length === 0 || !embeddingResponse[0].embedding) {
    console.error("[searchKnowledgeBase] Failed to generate a valid embedding for the search query:", query);
    throw new Error("Failed to generate a valid embedding for the search query.");
  }
  const embeddingVector = embeddingResponse[0].embedding;
  
  // The threshold is now always fetched from the database via the helper function.
  const distanceThreshold = await getDistanceThreshold();

  for (const level of PRIORITY_LEVELS) {
    try {
      let chunksQuery: FirebaseFirestore.Query = db.collection('kb_chunks');
      
      chunksQuery = chunksQuery.where('level', '==', level);

      if (topic) {
        chunksQuery = chunksQuery.where('topic', '==', topic);
      }
      
      const vectorQuery = chunksQuery.findNearest('embedding', embeddingVector, {
          limit: limit,
          distanceMeasure: 'COSINE'
      });

      const snapshot = await vectorQuery.get();

      if (snapshot.empty) {
        continue;
      }

      const relevantResults: SearchResult[] = [];
      snapshot.forEach(doc => {
        const distance = (doc as any).distance; 
        // A lower distance is better in COSINE similarity. We check if distance is LESS than threshold.
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

    } catch (error: any) {
        console.error(`[searchKnowledgeBase] Error searching in '${level}' priority level:`, error);
    }
  }

  return [];
}
