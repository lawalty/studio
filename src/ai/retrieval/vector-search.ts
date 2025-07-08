
/**
 * @fileOverview Performs a prioritized, sequential, vector-based semantic search on the knowledge base using Vertex AI Vector Search.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from a Vertex AI index. It searches 'High' priority documents first,
 *   then 'Medium', then 'Low', returning the first set of relevant results it finds that meet a confidence threshold.
 */
import { ai } from '@/ai/genkit';
import { db } from '@/lib/firebase-admin';
import { protos } from '@google-cloud/aiplatform';
// Using a two-step require for the client constructor, which can be more robust
// in a Next.js server environment for certain gRPC-based libraries.
const aiplatform = require('@google-cloud/aiplatform');
const { IndexEndpointServiceClient } = aiplatform.v1;


// The maximum distance for a search result to be considered relevant.
// Vertex AI Vector Search uses distance metrics (like Cosine distance), where a smaller
// value indicates higher similarity. A distance of 0.7 is a lenient threshold,
// allowing for good semantic matches even with typos or different phrasing.
const MAX_DISTANCE_THRESHOLD = 0.7;

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
  topic?: string;
  limit?: number;
}

const {
  GCLOUD_PROJECT,
  VERTEX_AI_INDEX_ID,
  VERTEX_AI_INDEX_ENDPOINT_ID,
  LOCATION,
} = process.env;

// Helper function to process the neighbors returned from Vertex AI search
async function processNeighbors(neighbors: protos.google.cloud.aiplatform.v1.FindNeighborsResponse.INeighbor[]): Promise<SearchResult[]> {
  if (!neighbors || neighbors.length === 0) {
    return [];
  }

  const neighborDocs = await Promise.all(
    neighbors.map(async (neighbor) => {
      if (!neighbor.datapoint?.datapointId) return null;

      const docRef = db.collection('kb_chunks').doc(neighbor.datapoint.datapointId);
      const docSnap = await docRef.get();
      
      if (!docSnap.exists) return null;

      return {
        ...(docSnap.data() as Omit<SearchResult, 'distance'>),
        distance: neighbor.distance || 0,
      };
    })
  );

  return neighborDocs
    .filter((doc): doc is SearchResult => doc !== null);
}


export async function searchKnowledgeBase({
  query,
  topic,
  limit = 5,
}: SearchParams): Promise<SearchResult[]> {
  // 1. Validate environment configuration.
  if (!GCLOUD_PROJECT || !VERTEX_AI_INDEX_ID || !VERTEX_AI_INDEX_ENDPOINT_ID || !LOCATION) {
    throw new Error(
      "Missing required environment variables for Vertex AI Search. Please set GCLOUD_PROJECT, VERTEX_AI_INDEX_ID, VERTEX_AI_INDEX_ENDPOINT_ID, and LOCATION."
    );
  }

  // 2. Generate an embedding for the user's query.
  const embeddingResponse = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: query,
  });
  const queryEmbedding = embeddingResponse[0]?.embedding;
  if (!queryEmbedding) {
    throw new Error("Failed to generate a valid embedding for the search query.");
  }

  // 3. Set up the Vertex AI client.
  const clientOptions = { apiEndpoint: `${LOCATION}-aiplatform.googleapis.com` };
  const indexEndpointServiceClient = new IndexEndpointServiceClient(clientOptions);

  // 4. Perform sequential search through priority levels.
  const searchLevels: string[] = ['High', 'Medium', 'Low'];
  const searchErrors: string[] = [];

  for (const level of searchLevels) {
    try {
      const restricts = [{ namespace: 'level', allow: [level] }];
      if (topic) {
        restricts.push({ namespace: 'topic', allow: [topic] });
      }
      
      const endpoint = `projects/${GCLOUD_PROJECT}/locations/${LOCATION}/indexEndpoints/${VERTEX_AI_INDEX_ENDPOINT_ID}`;

      const request: protos.google.cloud.aiplatform.v1.IFindNeighborsRequest = {
        indexEndpoint: endpoint,
        deployedIndexId: VERTEX_AI_INDEX_ID,
        queries: [{
          datapoint: {
            datapointId: 'query',
            featureVector: queryEmbedding,
            restricts: restricts,
          },
          neighborCount: limit,
        }],
      };
      
      // Explicit check to provide a clearer error message.
      if (typeof indexEndpointServiceClient.findNeighbors !== 'function') {
        throw new Error(`Critical Error: indexEndpointServiceClient.findNeighbors is NOT a function. The AI Platform client library may not have been imported correctly by the build system.`);
      }

      const [response] = await indexEndpointServiceClient.findNeighbors(request);
      const neighbors = response.nearestNeighbors?.[0]?.neighbors;

      if (neighbors && neighbors.length > 0) {
        // Filter the results by the distance threshold.
        const relevantNeighbors = neighbors.filter(
          (neighbor: protos.google.cloud.aiplatform.v1.FindNeighborsResponse.INeighbor) => (neighbor.distance ?? 1) < MAX_DISTANCE_THRESHOLD
        );

        if (relevantNeighbors.length > 0) {
          const results = await processNeighbors(relevantNeighbors);
          if (results.length > 0) {
            // Found relevant results, return them immediately.
            console.log(`[searchKnowledgeBase] Found ${results.length} relevant results in '${level}' priority KB.`);
            return results;
          }
        }
      }
    } catch (error: any) {
      console.error(`Error searching level '${level}' in knowledge base:`, error);
      // Collect errors instead of just logging. This helps diagnose config issues.
      searchErrors.push(`Level '${level}': ${error.message || 'Unknown error'}`);
    }
  }

  // If we get here, it means no results were found in any level.
  // If there were errors during the search, we should throw them now so the user is aware.
  if (searchErrors.length > 0) {
    const combinedErrors = searchErrors.join('; ');
    if (combinedErrors.includes('PermissionDenied') || combinedErrors.includes('IAM')) {
       throw new Error(`Vertex AI Search failed due to a permission issue. Please ensure the service account for your application has the "Vertex AI User" role.`);
    }
    if (combinedErrors.includes('not found')) {
       throw new Error(`Vertex AI Search failed because an endpoint or index was not found. Please verify your VERTEX_AI_INDEX_ID and VERTEX_AI_INDEX_ENDPOINT_ID environment variables.`);
    }
    // Generic error for other cases.
    throw new Error(`Knowledge base search failed. Errors encountered: ${combinedErrors}`);
  }

  // If the loop completes with no results and no errors, it's a genuine empty result.
  console.log('[searchKnowledgeBase] No relevant results found in any priority KB meeting the threshold.');
  return [];
}
