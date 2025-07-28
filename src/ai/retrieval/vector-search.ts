'use server';
/**
 * @fileOverview Performs a vector-based semantic search on the knowledge base.
 * This version uses Firestore's native vector search capabilities with pre-filtering
 * to ensure only documents from specified priority levels are searched.
 */
import { admin } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit';

export interface SearchResult {
  sourceId: string;
  text: string;
  sourceName: string;
  level: string;
  topic: string;
  downloadURL?: string;
  distance: number; // This will now be the similarity score from Firestore (0 to 1)
  pageNumber?: number;
  title?: string;
  header?: string;
}

interface SearchParams {
  query: string;
  limit?: number;
  distanceThreshold?: number;
}

// Function to pre-process text for better embedding and search quality.
const preprocessText = (text: string): string => {
  if (!text) return '';
  return text.toLowerCase();
};

export async function searchKnowledgeBase({
  query,
  limit = 10,
  distanceThreshold = 0.6,
}: SearchParams): Promise<SearchResult[]> {
  const firestore = admin.firestore();
  try {
    const processedQuery = preprocessText(query);
    
    // 1. Generate an embedding for the user's query, ensuring dimensions match the index.
    const embeddingResponse = await ai.embed({
      embedder: 'googleai/text-embedding-004',
      content: processedQuery,
      options: {
        outputDimensionality: 768,
      }
    });

    const queryEmbedding = embeddingResponse?.[0]?.embedding;
    if (!queryEmbedding || queryEmbedding.length !== 768) {
      throw new Error(`Failed to generate a valid 768-dimension embedding for the search query. Vector length received: ${queryEmbedding?.length || 0}`);
    }
    
    // 2. Perform the vector search directly in Firestore with pre-filtering.
    // This is the key change: we only search 'High', 'Medium', and 'Low' priority documents.
    const chunksCollection = firestore.collection('kb_chunks')
        .where('level', 'in', ['High', 'Medium', 'Low']);

    const vectorQuery = chunksCollection.findNearest('embedding', queryEmbedding, {
        limit,
        distanceMeasure: 'COSINE'
    });

    const querySnapshot = await vectorQuery.get();

    if (querySnapshot.empty) {
      return [];
    }

    // 3. Format the results, filtering by the distance threshold.
    const results: SearchResult[] = [];
    querySnapshot.forEach(doc => {
      // The 'distance' from a Firestore query is actually the similarity score (cosine similarity)
      const similarity = doc.distance;
      if (similarity >= distanceThreshold) {
        const data = doc.data();
        results.push({
          sourceId: data.sourceId,
          text: data.text,
          sourceName: data.sourceName,
          level: data.level,
          topic: data.topic,
          downloadURL: data.downloadURL,
          pageNumber: data.pageNumber,
          title: data.title,
          header: data.header,
          distance: similarity,
        });
      }
    });

    // Sort by highest similarity
    return results.sort((a, b) => b.distance - a.distance);

  } catch (error: any) {
    console.error('[searchKnowledgeBase] An error occurred during Firestore vector search:', error);
    const rawError = error.message || "An unknown error occurred.";
    let detailedError = `Search failed. This may be due to a configuration or permissions issue with Firestore. Details: ${rawError}`;

    if (rawError.includes('needs to be indexed') || (error.details && error.details.includes("no matching index found"))) {
        detailedError = `CRITICAL: Firestore is missing the required vector index for the 'kb_chunks' collection. Please ensure your 'firestore.indexes.json' file is configured correctly with a 768-dimension vector index and has been deployed via the Firebase CLI ('firebase deploy --only firestore:indexes').`;
    } else if (rawError.includes('permission denied') || rawError.includes('IAM')) {
      detailedError = `A permission error occurred while querying Firestore. Ensure the service account has the 'Cloud Datastore User' role. Full error: ${rawError}`;
    } else if (rawError.includes('INVALID_ARGUMENT')) {
      detailedError = `The search query failed due to an invalid argument. This often means the embedding vector's dimensions do not match the Firestore index dimensions. This app requires a 768-dimension index. Full error: ${rawError}`;
    }

    throw new Error(detailedError);
  }
}
