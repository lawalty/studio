
'use server';
/**
 * @fileOverview Performs a vector-based semantic search on the knowledge base.
 * This version uses the Vertex AI Vector Search endpoint for production-ready, scalable search.
 */
import { admin } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit';
import { findNeighbors, type FindNeighborsRequest } from '@google-cloud/aiplatform/build/src/v1/index_endpoint_service_client';

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

// Helper function to validate that all required Vertex AI environment variables are set.
function getVertexAiParams() {
    const requiredVars = {
        GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
        LOCATION: process.env.LOCATION,
        VERTEX_AI_INDEX_ID: process.env.VERTEX_AI_INDEX_ID,
        VERTEX_AI_INDEX_ENDPOINT_ID: process.env.VERTEX_AI_INDEX_ENDPOINT_ID,
        VERTEX_AI_DEPLOYED_INDEX_ID: process.env.VERTEX_AI_DEPLOYED_INDEX_ID,
    };

    const missingVars = Object.entries(requiredVars)
        .filter(([, value]) => !value)
        .map(([key]) => key);

    if (missingVars.length > 0) {
        throw new Error(`CRITICAL: The following environment variables required for Vertex AI Search are missing: ${missingVars.join(', ')}. Please check your .env.local file or hosting provider's secret manager.`);
    }

    return requiredVars;
}

export async function searchKnowledgeBase({
  query,
  limit = 10,
}: SearchParams): Promise<SearchResult[]> {
  try {
    const { 
        GCLOUD_PROJECT, 
        LOCATION, 
        VERTEX_AI_INDEX_ENDPOINT_ID, 
        VERTEX_AI_DEPLOYED_INDEX_ID,
    } = getVertexAiParams();
    
    const processedQuery = preprocessText(query);
    
    // 1. Generate an embedding for the user's query.
    const embeddingResponse = await ai.embed({
      embedder: 'googleai/text-embedding-004',
      content: processedQuery,
    });

    const queryEmbedding = embeddingResponse?.[0]?.embedding;
    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error("Failed to generate a valid embedding for the search query.");
    }
    
    // 2. Prepare the request for Vertex AI Vector Search.
    const client = new admin.aiplatform.v1.IndexEndpointServiceClient();
    const endpointPath = client.indexEndpointPath(GCLOUD_PROJECT!, LOCATION!, VERTEX_AI_INDEX_ENDPOINT_ID!);
    
    const request: FindNeighborsRequest = {
        indexEndpoint: endpointPath,
        deployedIndexId: VERTEX_AI_DEPLOYED_INDEX_ID!,
        queries: [{
            datapoint: {
                datapointId: 'query', // A temporary ID for this query
                featureVector: queryEmbedding,
            },
            neighborCount: limit,
        }],
    };

    // 3. Call the Vertex AI service to find nearest neighbors.
    const [response] = await client.findNeighbors(request);
    
    const neighbors = response.nearestNeighbors?.[0]?.neighbors;
    if (!neighbors || neighbors.length === 0) {
      return [];
    }
    
    // 4. Retrieve full document data from Firestore using the IDs returned by Vertex AI.
    const firestore = admin.firestore();
    const chunkIds = neighbors.map(n => n.datapoint?.datapointId).filter((id): id is string => !!id);
    
    if (chunkIds.length === 0) {
      return [];
    }

    const chunksCollection = firestore.collection('kb_chunks');
    const chunkDocs = await chunksCollection.where(admin.firestore.FieldPath.documentId(), 'in', chunkIds).get();

    const chunksById = new Map(chunkDocs.docs.map(doc => [doc.id, doc.data()]));
    
    // 5. Combine Vertex AI results (distance) with Firestore data.
    const results: SearchResult[] = neighbors
        .map(neighbor => {
            const chunkId = neighbor.datapoint?.datapointId;
            const distance = neighbor.distance; // Vertex AI provides the distance
            
            if (!chunkId || distance === undefined || distance === null) return null;

            const chunkData = chunksById.get(chunkId);
            if (!chunkData) return null;

            return {
                sourceId: chunkData.sourceId,
                text: chunkData.text,
                sourceName: chunkData.sourceName,
                level: chunkData.level,
                topic: chunkData.topic,
                downloadURL: chunkData.downloadURL,
                pageNumber: chunkData.pageNumber,
                title: chunkData.title,
                header: chunkData.header,
                distance: 1 - distance, // Convert to similarity-like score if needed (COSINE is often 1-distance)
            };
        })
        .filter((result): result is SearchResult => result !== null)
        .sort((a, b) => b.distance - a.distance); // Sort by highest similarity (lowest distance)

    return results;
  } catch (error: any) {
    console.error('[searchKnowledgeBase] An error occurred during Vertex AI search:', error);
    // Provide a more user-friendly error message
    throw new Error(`Search failed. This may be due to a configuration issue with the Vertex AI environment variables or permissions. Details: ${error.message}`);
  }
}

