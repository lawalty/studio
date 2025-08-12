/**
 * @fileOverview Performs a vector-based semantic search by manually iterating
 * through all chunks in the knowledge base and calculating the distance. This
 * approach is used for diagnostics to bypass potential issues with Firestore's
 * native vector index.
 */
import { admin } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit';
import { preprocessText } from '@/ai/retrieval/preprocessing';

export interface SearchResult {
  sourceId: string;
  text: string;
  sourceName: string;
  level:string;
  topic:string;
  downloadURL?: string;
  distance: number;
  pageNumber?: number;
  title?: string;
  header?: string;
}

interface SearchParams {
  query: string;
  limit?: number;
  distanceThreshold: number;
}
const firestore = admin.firestore();

/**
 * Searches the knowledge base by manually calculating vector distances
 * across all chunks using an efficient collection group query.
 * @param {SearchParams} params - The search parameters.
 * @returns {Promise<SearchResult[]>} A promise that resolves to an array of search results.
 */
export async function searchKnowledgeBase({
  query,
  limit = 10,
  distanceThreshold,
}: SearchParams): Promise<SearchResult[]> {

  const results: SearchResult[] = [];

  const processedQuery = preprocessText(query);
  if (!processedQuery) {
    return []; // Return empty if query is empty after processing
  }

  const embeddingResponse = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: processedQuery
  });

  const queryEmbedding = embeddingResponse?.[0]?.embedding;
  if (!queryEmbedding || queryEmbedding.length !== 768) {
    throw new Error(`Failed to generate a valid 768-dimension embedding for the query.`);
  }

  // Use a collection group query to efficiently get all chunks from all
  // subcollections named 'kb_chunks' at once. This is much faster.
  const chunksSnapshot = await firestore.collectionGroup('kb_chunks').get();

  chunksSnapshot.forEach(doc => {
      const data = doc.data();
      const storedEmbedding = data.embedding;

      if (!storedEmbedding || !Array.isArray(storedEmbedding) || storedEmbedding.length !== 768) {
          // Skip chunks that have missing or malformed embeddings.
          return;
      }
      
      // Manually calculate Euclidean distance
      let sumOfSquares = 0;
      for (let i = 0; i < queryEmbedding.length; i++) {
        sumOfSquares += Math.pow(storedEmbedding[i] - queryEmbedding[i], 2);
      }
      const distance = Math.sqrt(sumOfSquares);

      // Only include results that are within the specified threshold.
      // This filtering is now done here based on the centralized refactor.
      if (distance <= distanceThreshold) {
        results.push({
          distance: distance,
          sourceId: data.sourceId,
          text: data.text,
          sourceName: data.sourceName,
          level: data.level,
          topic: data.topic,
          downloadURL: data.downloadURL,
          pageNumber: data.pageNumber,
          title: data.title,
          header: data.header,
        });
      }
  });

  // Sort by distance (ascending, so smaller is better) and then limit the results.
  return results.sort((a, b) => a.distance - b.distance).slice(0, limit);
}
