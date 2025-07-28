
'use server';
/**
 * @fileOverview Performs a vector-based semantic search on the knowledge base.
 * This version uses Firestore's native vector search capabilities.
 * NOTE: Firestore vector search does not currently support pre-filtering with
 * 'in'/'not-in'/'array-contains-any'. Therefore, we fetch results from all
 * levels and then filter them in the application code.
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
  distance: number; // Firestore returns distance (lower is better, e.g., 0.0 to 2.0)
  pageNumber?: number;
  title?: string;
  header?: string;
}

interface SearchParams {
  query: string;
  limit?: number;
  distanceThreshold?: number; // Represents the maximum allowed distance.
}

// Function to pre-process text for better embedding and search quality.
const preprocessText = (text: string): string => {
  if (!text) return '';
  return text.toLowerCase();
};

export async function searchKnowledgeBase({
  query,
  limit = 10,
  distanceThreshold = 0.4, // Default to a stricter distance threshold.
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
    
    // 2. Perform the vector search directly in Firestore on the entire collection.
    const chunksCollection = firestore.collection('kb_chunks');

    const vectorQuery = chunksCollection.findNearest('embedding', queryEmbedding, {
        limit: limit * 2, // Fetch more results to allow for filtering
        distanceMeasure: 'COSINE'
    });

    const querySnapshot = await vectorQuery.get();

    if (querySnapshot.empty) {
      return [];
    }

    // 3. Format and filter the results in the application code.
    const results: SearchResult[] = [];
    const validLevels = new Set(['High', 'Medium', 'Low']);

    querySnapshot.forEach(doc => {
      const data = doc.data();
      // distance is returned by Firestore, where a smaller value is better (more similar).
      const distance = doc.distance;
      
      // Post-query filtering. We check if the distance is LESS than or equal to the threshold.
      if (validLevels.has(data.level) && distance <= distanceThreshold) {
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
          distance: distance,
        });
      }
    });

    // Sort by lowest distance (most similar) and apply the final limit
    return results
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);

  } catch (error: any) {
    console.error('[searchKnowledgeBase] An error occurred during Firestore vector search:', error);
    const rawError = error.message || "An unknown error occurred.";
    let detailedError = `Search failed. This may be due to a configuration or permissions issue with Firestore. Details: ${rawError}`;

    if (rawError.includes('FAILED_PRECONDITION') && rawError.includes('vector index')) {
        detailedError = `CRITICAL: Firestore is missing the required vector index for the 'kb_chunks' collection, or the index is still building. Please ensure the index is configured as specified in 'firestore.indexes.json' and has been deployed successfully using 'firebase deploy --only firestore:indexes'. Index creation can take up to 10 minutes.`;
    } else if (rawError.includes('needs to be indexed') || (error.details && error.details.includes("no matching index found"))) {
        detailedError = `CRITICAL: Firestore is missing the required vector index for the 'kb_chunks' collection. Please ensure your 'firestore.indexes.json' file is configured correctly with a 768-dimension COSINE vector index and has been deployed via the Firebase CLI ('firebase deploy --only firestore:indexes').`;
    } else if (rawError.includes('permission denied') || rawError.includes('IAM')) {
      detailedError = `A permission error occurred while querying Firestore. Ensure the service account has the 'Cloud Datastore User' role. Full error: ${rawError}`;
    } else if (rawError.includes('INVALID_ARGUMENT')) {
      detailedError = `The search query failed due to an invalid argument. This often means the embedding vector's dimensions do not match the Firestore index dimensions, or an unsupported query filter was used. This app requires a 768-dimension index. Full error: ${rawError}`;
    }

    throw new Error(detailedError);
  }
}
