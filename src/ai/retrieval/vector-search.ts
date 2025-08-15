
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

// Define a priority order for the knowledge base levels.
const LEVEL_PRIORITY: Record<string, number> = {
    'High': 1,
    'Chat History': 2,
    'Medium': 3,
    'Low': 4,
    'Spanish PDFs': 5,
    // 'Archive' is filtered out and won't be searched.
};

/**
 * Calculates the cosine distance between two vectors.
 * Cosine distance is defined as 1 - cosine similarity.
 * @param {number[]} vecA - The first vector.
 * @param {number[]} vecB - The second vector.
 * @returns {number} The cosine distance, a value between 0 (identical) and 2 (opposite).
 */
function cosineDistance(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) {
    return 1; // Return a neutral distance if one of the vectors is zero.
  }

  const similarity = dotProduct / (magA * magB);
  return 1 - similarity;
}

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
      
      // Exclude documents from the 'Archive' level from the search
      if (data.level === 'Archive') {
          return; // Skip this chunk
      }

      const storedEmbedding = data.embedding;

      if (!storedEmbedding || !Array.isArray(storedEmbedding) || storedEmbedding.length !== 768) {
          // Skip chunks that have missing or malformed embeddings.
          return;
      }
      
      // Calculate Cosine Distance
      const distance = cosineDistance(queryEmbedding, storedEmbedding);
      
      // We gather all potential results first, regardless of the initial threshold.
      // The filtering will happen after sorting by priority.
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
  });

  // Sort results first by priority level (High > Medium > Low), then by distance.
  const sortedResults = results.sort((a, b) => {
    const priorityA = LEVEL_PRIORITY[a.level] || 99;
    const priorityB = LEVEL_PRIORITY[b.level] || 99;
    if (priorityA !== priorityB) {
        return priorityA - priorityB;
    }
    return a.distance - b.distance;
  });
  
  // Now, filter the correctly sorted results by the distance threshold.
  const finalResults = sortedResults.filter(result => result.distance <= distanceThreshold);

  return finalResults.slice(0, limit);
}
