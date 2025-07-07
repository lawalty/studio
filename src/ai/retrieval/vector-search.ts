/**
 * @fileOverview Performs a prioritized, sequential, vector-based semantic search on the knowledge base using Vertex AI Vector Search.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from a Vertex AI index. It searches 'High' priority documents first,
 *   then 'Medium', then 'Low', returning the first set of relevant results it finds.
 */
import { ai } from '@/ai/genkit';
import { db } from '@/lib/firebase-admin';
import { protos } from '@google-cloud/aiplatform';

// Use 'require' for the client to ensure compatibility with the Next.js production build environment,
// which can have issues with the module resolution of this specific gRPC-based library.
// We still import `protos` separately to maintain strong type-safety for request/response objects.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { IndexEndpointServiceClient } = require('@google-cloud/aiplatform').v1beta1;


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
async function processNeighbors(neighbors: protos.google.cloud.aiplatform.v1beta1.FindNeighborsResponse.INeighbor[]): Promise<SearchResult[]> {
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

  // 3. Set up the Vertex AI client using the required client.
  const clientOptions = { apiEndpoint: `${LOCATION}-aiplatform.googleapis.com` };
  const indexEndpointServiceClient = new IndexEndpointServiceClient(clientOptions);
  const endpoint = `projects/${GCLOUD_PROJECT}/locations/${LOCATION}/indexEndpoints/${VERTEX_AI_INDEX_ENDPOINT_ID}`;

  // 4. Perform sequential search through priority levels.
  const searchLevels: string[] = ['High', 'Medium', 'Low'];

  for (const level of searchLevels) {
    try {
      const restricts = [{ namespace: 'level', allow: [level] }];
      if (topic) {
        restricts.push({ namespace: 'topic', allow: [topic] });
      }

      const request: protos.google.cloud.aiplatform.v1beta1.IFindNeighborsRequest = {
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
      
      const [response] = await indexEndpointServiceClient.findNeighbors(request);
      const neighbors = response.nearestNeighbors?.[0]?.neighbors;

      if (neighbors && neighbors.length > 0) {
        const results = await processNeighbors(neighbors);
        if (results.length > 0) {
          // Found results, return them immediately.
          return results;
        }
      }
    } catch (error: any) {
      console.error(`Error searching level '${level}' in knowledge base:`, error);
      if (error.message && error.message.includes('PermissionDenied')) {
        throw new Error(`Vertex AI Search failed due to a permission issue. Please ensure the service account for your application has the "Vertex AI User" role.`);
      }
      // If it's another error, we log it and continue to the next level.
    }
  }

  // If the loop completes without returning, no results were found.
  return [];
}
