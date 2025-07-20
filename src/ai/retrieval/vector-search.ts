
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

// A reasonable default threshold. Lower is a better match.
const DEFAULT_DISTANCE_THRESHOLD = 0.7;

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
  topic,
  limit = 5,
  distanceThreshold, 
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

  // If a distance threshold is passed in (like from the diagnostic test), use it. Otherwise, use the reliable default.
  const finalDistanceThreshold = distanceThreshold ?? DEFAULT_DISTANCE_THRESHOLD;

  // 2. Perform prioritized, sequential search through Firestore.
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
        continue; // Try the next level
      }

      const relevantResults: SearchResult[] = [];
      snapshot.forEach(doc => {
        const distance = (doc as any).distance; 
        // A lower distance means a better match. We keep results where the distance is LESS than the threshold.
        if (distance < finalDistanceThreshold) {
            relevantResults.push({
                ...(doc.data() as Omit<SearchResult, 'distance'>),
                distance: distance,
            });
        }
      });

      if (relevantResults.length > 0) {
        // We found results at this priority level, so we return them and stop searching lower levels.
        return relevantResults;
      }

    } catch (error: any) {
        // Log the error but continue to the next priority level.
        console.error(`[searchKnowledgeBase] Error searching in '${level}' priority level:`, error);
    }
  }

  // If the loop completes without finding any results that meet the threshold.
  return [];
}
