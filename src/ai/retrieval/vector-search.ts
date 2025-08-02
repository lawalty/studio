
'use server';
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
  level: string;
  topic: string;
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

export async function searchKnowledgeBase({
  query,
  limit = 10,
  distanceThreshold,
}: SearchParams): Promise<SearchResult[]> {

  const processedQuery = preprocessText(query);
  const embeddingResponse = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: processedQuery,
    options: { taskType: 'RETRIEVAL_QUERY', outputDimensionality: 768 }
  });

  const queryEmbedding = embeddingResponse?.[0]?.embedding;
  if (!queryEmbedding || queryEmbedding.length !== 768) {
    throw new Error(`Failed to generate a valid 768-dimension embedding for the query.`);
  }

  const firestore = admin.firestore();
  const chunksCollection = firestore.collection('kb_chunks');

  // This query now uses the new composite index on 'level' and 'embedding'.
  const vectorQuery = chunksCollection
    .findNearest('embedding', queryEmbedding, {
      limit,
      distanceMeasure: 'EUCLIDEAN',
  });

  let querySnapshot;
  try {
    querySnapshot = await vectorQuery.get();
  } catch (e: any) {
    console.error("[FirestoreVectorSearch] Error calling findNearest:", e);
    let detail = "An unexpected error occurred with the Firestore vector search.";
    if (e.message?.includes('requires a vector index')) {
      detail = `A Firestore vector index is required. Please run the gcloud command from the error message to create it.`;
    } else if (e.message?.includes('permission-denied')) {
        detail = `A permissions error occurred. Check your server's IAM roles.`;
    }
    throw new Error(`[FirestoreVectorSearch] ${detail} Raw Error: ${e.message}`);
  }

  const results: SearchResult[] = [];
  querySnapshot.forEach(doc => {
    const data = doc.data();
    const distance = doc.vectorDistance;

    // Re-enabling the distance threshold filter.
    // if (distance <= distanceThreshold) {
        results.push({
          distance,
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
    // }
  });

  return results;
}
