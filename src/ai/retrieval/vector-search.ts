
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
  return text
    .toLowerCase() // Convert to lowercase
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim(); // Trim leading/trailing spaces
};

export async function searchKnowledgeBase({
  query,
  limit = 10,
  distanceThreshold = 0.4,
}: SearchParams): Promise<SearchResult[]> {
  const firestore = admin.firestore();
  try {
    const processedQuery = preprocessText(query);
    
    const embeddingResponse = await ai.embed({
      embedder: 'googleai/text-embedding-004',
      content: processedQuery,
      options: { outputDimensionality: 768 },
    });

    const queryEmbedding = embeddingResponse?.[0]?.embedding;
    if (!queryEmbedding || queryEmbedding.length !== 768) {
      throw new Error(`Failed to generate a valid 768-dimension embedding. Vector length: ${queryEmbedding?.length || 0}`);
    }

    const chunksCollection = firestore.collection('kb_chunks');
    // Fetch a larger pool of candidates to filter and sort from.
    const vectorQuery = chunksCollection.findNearest('embedding', queryEmbedding, {
      limit: limit * 3, // Fetch more results to ensure we have enough to filter by level.
      distanceMeasure: 'COSINE',
    });
    
    const querySnapshot = await vectorQuery.get();

    const candidates: SearchResult[] = [];
    if (!querySnapshot.empty) {
      querySnapshot.forEach(doc => {
        const data = doc.data();
        const distance = doc.distance;
        // The check is now `distance <= distanceThreshold` because smaller distance means more similar for COSINE.
        if (distance <= distanceThreshold) {
          candidates.push({
            sourceId: data.sourceId,
            text: data.text,
            sourceName: data.sourceName,
            level: data.level, // The level field is now present on the document
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

    // Sort candidates by distance to ensure we're comparing the closest matches first.
    candidates.sort((a, b) => a.distance - b.distance);

    const finalResults: SearchResult[] = [];
    const addedSourceIds = new Set<string>();

    for (const level of KB_LEVELS_IN_ORDER) {
      for (const candidate of candidates) {
        if (finalResults.length >= limit) {
          break;
        }
        // This filter will now work correctly as `level` is present in the chunks.
        if (candidate.level === level && !addedSourceIds.has(candidate.sourceId)) {
          finalResults.push(candidate);
          addedSourceIds.add(candidate.sourceId);
        }
      }
      if (finalResults.length >= limit) {
        break;
      }
    }
    
    // If no results after level-based sorting, return the closest matches regardless of level.
    if (finalResults.length === 0 && candidates.length > 0) {
        const uniqueCandidates: SearchResult[] = [];
        candidates.forEach(candidate => {
            if (!addedSourceIds.has(candidate.sourceId)) {
                uniqueCandidates.push(candidate);
                addedSourceIds.add(candidate.sourceId);
            }
        });
        return uniqueCandidates.slice(0, limit);
    }
    
    return finalResults;

  } catch (error: any) {
    console.error('[searchKnowledgeBase] An error occurred during Firestore vector search:', error);
    const rawError = error.message || "An unknown error occurred.";
    let detailedError = `Search failed due to a configuration or permissions issue. Details: ${rawError}`;

    if (rawError.includes('vector index')) {
        detailedError = `CRITICAL: The required vector index for the 'kb_chunks' collection is missing or still building. Please deploy it using 'firebase deploy --only firestore:indexes' and wait for completion.`;
    } else if (rawError.includes('permission denied') || (error.code === 7)) {
      detailedError = `CRITICAL: The search failed due to a permissions error. The App Hosting service account is missing the required IAM role to read from Firestore.

Action Required:
1. Go to the IAM page in your Google Cloud Console.
2. Find the principal named 'App Hosting Service Account' (firebase-app-hosting-compute@...).
3. Grant it the 'Cloud Datastore User' role.
Full technical error: ${rawError}`;
    } else if (rawError.includes('INVALID_ARGUMENT')) {
      detailedError = `The search failed due to an invalid argument, likely a mismatch between the embedding vector's dimensions (768) and the Firestore index. Full error: ${rawError}`;
    }

    throw new Error(detailedError);
  }
}
