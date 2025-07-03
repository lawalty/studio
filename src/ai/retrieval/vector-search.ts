/**
 * @fileOverview Performs filtered, vector-based semantic search on the knowledge base using the Firestore Vector Search extension.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from Firestore based on a query and filters.
 */
import { ai } from '@/ai/genkit';
import { db } from '@/lib/firebase-admin';

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
  level?: string[];
  topic?: string;
  limit?: number;
}


/**
 * Searches the knowledge base for text chunks semantically similar to the query,
 * applying filters for tier and topic using the Firestore Vector Search extension.
 * @param params An object with the query and optional filters.
 * @returns An array of the top matching result objects.
 */
export async function searchKnowledgeBase({
  query,
  level,
  topic,
  limit = 5,
}: SearchParams): Promise<SearchResult[]> {
  // 1. Generate an embedding for the user's query.
  const embeddingResponse = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: query,
  });

  const queryEmbedding = embeddingResponse[0]?.embedding;

  if (!queryEmbedding) {
    throw new Error("Failed to generate a valid embedding for the search query.");
  }

  // 2. Build the filter for the vector search.
  const queryFilter: any = {};

  // Apply level (tier) filter. 'Archive' is always excluded.
  const levelsToSearch = level && level.length > 0 ? level : ['High', 'Medium', 'Low'];
  queryFilter.level = { $in: levelsToSearch };

  // Apply topic filter if provided.
  if (topic) {
    queryFilter.topic = { $eq: topic };
  }

  // 3. Perform the vector search using the Firestore extension.
  const searchResults = await db.collection('kb_chunks').findNearest('embedding', {
    vector: queryEmbedding,
    limit: limit,
    distanceMeasure: 'COSINE',
    filter: queryFilter,
  });

  if (searchResults.empty) {
    return [];
  }

  const topResults: SearchResult[] = searchResults.docs.map(doc => {
    const data = doc.data();
    return {
      text: data.text,
      sourceName: data.sourceName,
      level: data.level,
      topic: data.topic,
      downloadURL: data.downloadURL,
      distance: doc.distance,
    };
  });

  return topResults;
}
