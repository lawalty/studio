
'use server';
/**
 * @fileOverview Performs a prioritized, sequential, vector-based semantic search on the knowledge base using Firestore's native vector search.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from the 'kb_chunks' collection in Firestore. It searches 'High' priority documents first,
 *   then 'Medium', then 'Low', then 'Chat History', returning the first set of relevant results it finds that meet a confidence threshold.
 */
import { db } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit'; // Ensures Genkit is configured

const MAX_DISTANCE_THRESHOLD = 0.7; 

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

export async function searchKnowledgeBase({
  query,
  topic,
  limit = 5,
}: SearchParams): Promise<SearchResult[]> {
  // 1. Generate an embedding for the user's query.
  const embedding = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: query,
  });
  
  if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
    console.error("[searchKnowledgeBase] Failed to generate a valid embedding for the search query:", query);
    throw new Error("Failed to generate a valid embedding for the search query.");
  }
  
  // 2. Perform prioritized, sequential search through Firestore.
  for (const level of PRIORITY_LEVELS) {
    try {
      let chunksQuery: FirebaseFirestore.Query = db.collection('kb_chunks');
      
      chunksQuery = chunksQuery.where('level', '==', level);

      if (topic) {
        chunksQuery = chunksQuery.where('topic', '==', topic);
      }
      
      const vectorQuery = chunksQuery.findNearest('embedding', embedding, {
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
        if (distance < MAX_DISTANCE_THRESHOLD) {
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
