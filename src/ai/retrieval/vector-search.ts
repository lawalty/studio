/**
 * @fileOverview Performs a vector-based semantic search using Firestore's
 * native vector search capabilities.
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
 * Searches the 'kb_chunks' collection group using Firestore's native vector search.
 * @param {SearchParams} params - The search parameters.
 * @returns {Promise<SearchResult[]>} A promise that resolves to an array of search results.
 */
export async function searchKnowledgeBase({
  query,
  limit = 10,
  distanceThreshold,
}: SearchParams): Promise<SearchResult[]> {
  const processedQuery = preprocessText(query);
  if (!processedQuery) {
    return []; // Return empty if query is empty after processing
  }

  const embeddingResponse = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: processedQuery,
  });

  const queryEmbedding = embeddingResponse?.[0]?.embedding;
  if (!queryEmbedding || queryEmbedding.length !== 768) {
    throw new Error(`Failed to generate a valid 768-dimension embedding for the query.`);
  }

  const chunksCollection = firestore.collectionGroup('kb_chunks');
  const vectorQuery = chunksCollection.findNearest('embedding', queryEmbedding, {
    limit: limit,
    distanceMeasure: 'COSINE',
  });

  const querySnapshot = await vectorQuery.get();

  const results: SearchResult[] = [];
  querySnapshot.forEach(doc => {
    // The distance is a direct property on the snapshot documents in a vector query
    const distance = (doc as any).distance;
    
    // Filter results by the dynamic distance threshold from the config.
    // Note: For COSINE distance, a smaller value means a closer match.
    if (distance <= distanceThreshold) {
      const data = doc.data();
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

  // Firestore's findNearest already returns results sorted by distance,
  // so an additional sort is not strictly necessary unless you want to reverse it.
  // The default order (ascending distance) is correct.
  return results;
}
