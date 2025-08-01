
'use server';
/**
 * @fileOverview Performs a vector-based semantic search using Firestore's
 * native vector search capabilities.
 */
import { admin } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit';
import { FieldValue } from 'firebase-admin/firestore';
import { preprocessText } from '@/ai/retrieval/preprocessing'; // Import the shared pre-processing function

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

// Removed local preprocessText function, now imported from preprocessing.ts

export async function searchKnowledgeBase({
  query,
  limit = 10,
  distanceThreshold,
}: SearchParams): Promise<SearchResult[]> {

  // =================================================================================
  // 1. GENERATE THE QUERY EMBEDDING
  // =================================================================================
  const processedQuery = preprocessText(query); // Use the imported pre-processing function
  const embeddingResponse = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: processedQuery,
    options: { taskType: 'RETRIEVAL_QUERY', outputDimensionality: 768 }
  });

  const queryEmbeddingArray = embeddingResponse?.[0]?.embedding;
  if (!queryEmbeddingArray || queryEmbeddingArray.length !== 768) {
    throw new Error(`Failed to generate a valid 768-dimension embedding for the query.`);
  }

  // Explicitly create a Firestore Vector object. This removes any ambiguity
  // and ensures the data type passed to the query is exactly what Firestore expects.
  const queryEmbedding = new FieldValue.Vector(queryEmbeddingArray);


  // =================================================================================
  // 2. CONNECT TO FIRESTORE AND PERFORM THE VECTOR SEARCH
  // =================================================================================
  const firestore = admin.firestore();
  const chunksCollection = firestore.collection('kb_chunks');

  // Perform the vector search using findNearest
  const vectorQuery = chunksCollection.findNearest('embedding', queryEmbedding, {
    limit,
    distanceMeasure: 'COSINE',
  });

  let querySnapshot;
  try {
    querySnapshot = await vectorQuery.get();
  } catch (e: any) {
    console.error("[FirestoreVectorSearch] Error calling findNearest:", e);
    let detail = "An unexpected error occurred with the Firestore vector search.";
    if (e.message?.includes('requires a vector index')) {
      detail = `A Firestore vector index is required to perform this search. Please ensure the index has been created in your Firebase console for the 'kb_chunks' collection on the 'embedding' field. The error from the server usually contains a direct link to create it.`;
    } else if (e.message?.includes('permission-denied') || e.message?.includes('permission denied')) {
        detail = `A permissions error occurred. Please ensure your server's credentials have the correct IAM roles (e.g., 'Firebase Admin' or 'Cloud Datastore User') to query Firestore.`;
    }
    throw new Error(`[FirestoreVectorSearch] ${detail} Raw Error: ${e.message}`);
  }

  const results: SearchResult[] = [];
  querySnapshot.forEach(doc => {
    const data = doc.data();
    const distance = doc.vectorDistance; // This is the distance from the query embedding
    
    // Apply the manual distance threshold filter
    if (distance <= distanceThreshold) {
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
    }
  });

  // Firestore's findNearest already sorts by distance, so no need to re-sort.
  return results;
}
