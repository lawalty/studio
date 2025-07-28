
'use server';
/**
 * @fileOverview Performs a tiered, vector-based semantic search on the knowledge base
 * using Firestore's native vector search capabilities. It prioritizes results from
 * different knowledge base levels (High, Medium, Low).
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
  distance: number;
  pageNumber?: number;
  title?: string;
  header?: string;
}

interface SearchParams {
  query: string;
  limit?: number;
  distanceThreshold?: number;
}

// Defines the order of priority for searching the knowledge base.
const KB_LEVELS_IN_ORDER: ('High' | 'Medium' | 'Low')[] = ['High', 'Medium', 'Low'];

const preprocessText = (text: string): string => {
  if (!text) return '';
  return text.toLowerCase();
};

export async function searchKnowledgeBase({
  query,
  limit = 10,
  distanceThreshold = 0.4,
}: SearchParams): Promise<SearchResult[]> {
  const firestore = admin.firestore();
  try {
    const processedQuery = preprocessText(query);
    
    // Generate a 768-dimension embedding for the user's query.
    const embeddingResponse = await ai.embed({
      embedder: 'googleai/text-embedding-004',
      content: processedQuery,
      options: { outputDimensionality: 768 },
    });

    const queryEmbedding = embeddingResponse?.[0]?.embedding;
    if (!queryEmbedding || queryEmbedding.length !== 768) {
      throw new Error(`Failed to generate a valid 768-dimension embedding. Vector length: ${queryEmbedding?.length || 0}`);
    }

    const allResults: SearchResult[] = [];
    const chunksCollection = firestore.collection('kb_chunks');

    // Sequentially search each knowledge base level.
    for (const level of KB_LEVELS_IN_ORDER) {
      if (allResults.length >= limit) {
        break; // Stop if we have already collected enough results.
      }

      const vectorQuery = chunksCollection
        .where('level', '==', level)
        .findNearest('embedding', queryEmbedding, {
          limit,
          distanceMeasure: 'COSINE',
        });
      
      const querySnapshot = await vectorQuery.get();

      if (!querySnapshot.empty) {
        querySnapshot.forEach(doc => {
          const data = doc.data();
          const distance = doc.distance;

          if (distance <= distanceThreshold) {
            allResults.push({
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
      }
    }
    
    // Sort combined results by distance and return the top 'limit' results.
    return allResults
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

  } catch (error: any) {
    console.error('[searchKnowledgeBase] An error occurred during Firestore vector search:', error);
    const rawError = error.message || "An unknown error occurred.";
    let detailedError = `Search failed due to a configuration or permissions issue. Details: ${rawError}`;

    if (rawError.includes('vector index')) {
        detailedError = `CRITICAL: The required vector index for the 'kb_chunks' collection is missing or still building. Please deploy it using 'firebase deploy --only firestore:indexes' and wait for completion.`;
    } else if (rawError.includes('permission denied')) {
      detailedError = `A permission error occurred. Ensure the service account has the 'Cloud Datastore User' role. Full error: ${rawError}`;
    } else if (rawError.includes('INVALID_ARGUMENT')) {
      detailedError = `The search failed due to an invalid argument, likely a mismatch between the embedding vector's dimensions (768) and the Firestore index. Full error: ${rawError}`;
    }

    throw new Error(detailedError);
  }
}
