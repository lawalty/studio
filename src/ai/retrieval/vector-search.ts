
'use server';
/**
 * @fileOverview Performs a prioritized, sequential, vector-based semantic search on the knowledge base using Firestore's native vector search.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from the 'kb_chunks' collection in Firestore. It searches 'High' priority documents first,
 *   then 'Medium', then 'Low', returning the first set of relevant results it finds that meet a confidence threshold.
 */
import { db } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit'; // Ensures Genkit is configured
import { FieldValue, VectorValue } from 'firebase-admin/firestore';

// The maximum distance for a search result to be considered relevant.
// Firestore's vector search uses distance metrics (like Cosine distance), where a smaller
// value indicates higher similarity. A distance of 0 means a perfect match.
// We are setting this to 0.7, which is a good starting point for high-quality matches.
// A lower value makes the search stricter, and a higher value makes it more lenient.
const MAX_DISTANCE_THRESHOLD = 0.7; 

const PRIORITY_LEVELS: Readonly<('High' | 'Medium' | 'Low')[]> = ['High', 'Medium', 'Low'];

interface SearchResult {
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
  const embeddingResponse = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: query,
  });

  if (!embeddingResponse || embeddingResponse.length === 0) {
    throw new Error("Failed to generate embeddings for the search query.");
  }

  const queryEmbedding = embeddingResponse[0].embedding;

  if (!queryEmbedding || queryEmbedding.length === 0) {
    throw new Error("Failed to generate a valid embedding for the search query.");
  }
  
  // 2. Perform prioritized, sequential search through Firestore.
  for (const level of PRIORITY_LEVELS) {
    try {
      // Start building the query against the 'kb_chunks' collection
      let chunksQuery: FirebaseFirestore.Query = db.collection('kb_chunks');
      
      // Apply the mandatory level filter
      chunksQuery = chunksQuery.where('level', '==', level);

      // Apply the optional topic filter if provided
      if (topic) {
        chunksQuery = chunksQuery.where('topic', '==', topic);
      }
      
      // Perform the vector search
      const vectorQuery = chunksQuery.findNearest('embedding', new VectorValue(queryEmbedding), {
          limit: limit,
          distanceMeasure: 'COSINE'
      });

      const snapshot = await vectorQuery.get();

      if (snapshot.empty) {
        console.log(`[searchKnowledgeBase] No results found in '${level}' priority knowledge base.`);
        continue; // Try the next level
      }

      // Filter out results that don't meet our confidence threshold
      const relevantResults = snapshot.docs
        .map(doc => {
          const data = doc.data();
          const distance = doc.distance;
          return {
            ...data,
            distance,
          } as SearchResult;
        })
        .filter(result => result.distance < MAX_DISTANCE_THRESHOLD);

      if (relevantResults.length > 0) {
        console.log(`[searchKnowledgeBase] Found ${relevantResults.length} relevant results in '${level}' priority knowledge base.`);
        return relevantResults; // Found results, so return immediately.
      }

    } catch (error: any) {
        console.error(`[searchKnowledgeBase] Error searching in '${level}' priority level:`, error);
        // Don't re-throw; we want to allow the search to continue to the next priority level.
    }
  }

  // If we get here, no relevant results were found in any priority level that met the threshold.
  console.log('[searchKnowledgeBase] No relevant results found in any knowledge base meeting the threshold.');
  return [];
}
