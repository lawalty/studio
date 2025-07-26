
'use server';
/**
 * @fileOverview Performs a prioritized, sequential, vector-based semantic search on the knowledge base using Firestore's native vector search.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from the 'kb_chunks' collection in Firestore. It fetches a broad set of results
 *   and then filters and prioritizes them in code ('High' -> 'Medium' -> 'Low') to ensure the most important results are returned first.
 */
import { db } from '@/lib/firebase-admin';
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
}

// Function to pre-process text for better embedding and search quality.
const preprocessText = (text: string): string => {
  if (!text) return '';
  return text.toLowerCase();
};

// Helper to get the distance threshold from Firestore.
async function getDistanceThreshold(): Promise<number> {
    const docRef = db.collection('configurations').doc('site_display_assets');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        const data = docSnap.data();
        const storedThreshold = data?.vectorSearchDistanceThreshold;

        // Handle both number and array-from-slider cases
        if (Array.isArray(storedThreshold) && typeof storedThreshold[0] === 'number') {
            return Math.max(0, Math.min(2, storedThreshold[0]));
        } else if (typeof storedThreshold === 'number') {
            return Math.max(0, Math.min(2, storedThreshold));
        }
    }
    // If no value is in Firestore, return a default that is permissive for testing.
    return 1.0;
}

export async function searchKnowledgeBase({
  query,
  limit = 5,
}: SearchParams): Promise<SearchResult[]> {

  const processedQuery = preprocessText(query);
  
  const embeddingResponse = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: processedQuery,
  });

  const embeddingVector = embeddingResponse?.[0]?.embedding;
  if (!embeddingVector || embeddingVector.length === 0) {
    console.error("[searchKnowledgeBase] Failed to generate a valid embedding for the search query:", processedQuery);
    throw new Error("Failed to generate a valid embedding for the search query.");
  }
  
  const distanceThreshold = await getDistanceThreshold();
  const priorityLevels: string[] = ['High', 'Medium', 'Low'];
  const finalResults: SearchResult[] = [];

  for (const level of priorityLevels) {
    if (finalResults.length >= limit) {
      break; // Stop searching if we have enough results
    }

    const vectorQuery = db.collection('kb_chunks')
      .where('level', '==', level)
      .findNearest('embedding', embeddingVector, {
          limit: limit, // Query for the remaining number of results needed
          distanceMeasure: 'COSINE'
      });
      
    const snapshot = await vectorQuery.get();

    if (!snapshot.empty) {
      snapshot.forEach(doc => {
        const distance = (doc as any).distance;
        if (distance <= distanceThreshold && finalResults.length < limit) {
          finalResults.push({
            ...(doc.data() as Omit<SearchResult, 'distance'>),
            distance: distance,
          });
        }
      });
    }
  }

  // Sort final aggregated results by distance to ensure the best matches are first
  finalResults.sort((a, b) => a.distance - b.distance);

  return finalResults.slice(0, limit);
}
