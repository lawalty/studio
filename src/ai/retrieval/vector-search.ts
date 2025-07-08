
/**
 * @fileOverview Performs a prioritized, sequential, vector-based semantic search on the knowledge base using Vertex AI Vector Search.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from a Vertex AI index. It searches 'High' priority documents first,
 *   then 'Medium', then 'Low', returning the first set of relevant results it finds that meet a confidence threshold.
 */
import { ai } from '@/ai/genkit';
import { db } from '@/lib/firebase-admin';
import { GoogleAuth } from 'google-auth-library';

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
  VERTEX_AI_DEPLOYED_INDEX_ID,
  VERTEX_AI_INDEX_ENDPOINT_ID,
  LOCATION,
} = process.env;

// Define the structure of the neighbor objects from the REST API response
interface RestApiNeighbor {
    datapoint: {
        datapointId: string;
    };
    distance: number;
}

// Helper function to process the neighbors returned from Vertex AI search
async function processNeighbors(neighbors: RestApiNeighbor[]): Promise<SearchResult[]> {
  if (!neighbors || neighbors.length === 0) {
    return [];
  }

  const neighborDocs = await Promise.all(
    neighbors.map(async (neighbor: RestApiNeighbor) => {
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
  if (!GCLOUD_PROJECT || !VERTEX_AI_DEPLOYED_INDEX_ID || !VERTEX_AI_INDEX_ENDPOINT_ID || !LOCATION) {
    throw new Error(
      "Missing required environment variables for Vertex AI Search. Please set GCLOUD_PROJECT, VERTEX_AI_DEPLOYED_INDEX_ID, VERTEX_AI_INDEX_ENDPOINT_ID, and LOCATION in your .env.local file."
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

  // 3. Set up authentication for the REST API call.
  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });
  const authToken = await auth.getAccessToken();

  // 4. Perform a single, unfiltered search across the entire index as a debugging step.
  try {
    const endpointUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${GCLOUD_PROJECT}/locations/${LOCATION}/indexEndpoints/${VERTEX_AI_INDEX_ENDPOINT_ID}:findNeighbors`;

    // As a debugging step, we are temporarily removing the `restricts` parameter 
    // to make the simplest possible call to the endpoint.
    const requestBody: {
        deployedIndexId: string;
        queries: {
            datapoint: {
                datapointId: string;
                featureVector: number[];
                restricts?: any[];
            },
            neighborCount: number;
        }[];
    } = {
      deployedIndexId: VERTEX_AI_DEPLOYED_INDEX_ID,
      queries: [{
        datapoint: {
          datapointId: 'query',
          featureVector: queryEmbedding,
        },
        neighborCount: limit,
      }],
    };
    
    // Add topic restriction if provided. This is a common use case that we can keep.
    if (topic) {
        requestBody.queries[0].datapoint.restricts = [{ namespace: 'topic', allowList: [topic] }];
    }
      
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorBody = await response.json();
        // Check for 501 error specifically to provide better user feedback.
        if (response.status === 501) {
            const endpointId = process.env.VERTEX_AI_INDEX_ENDPOINT_ID;
            throw new Error(`The Vertex AI service returned a '501 Not Implemented' error. This indicates the Index Endpoint is not correctly configured to serve requests. Action Required: 1. Go to the Vertex AI -> Vector Search -> Index Endpoints section in your Google Cloud Console. 2. Verify that the endpoint with ID '${endpointId}' exists and has a green checkmark indicating it is active. 3. Ensure your index is correctly deployed to this endpoint. 4. Confirm that the endpoint is a Public Endpoint, as private endpoints require different configurations.`);
        }
        throw new Error(`API call failed with status ${response.status}: ${JSON.stringify(errorBody.error?.message || errorBody)}`);
    }
        
    const responseData = await response.json();
    const neighbors: RestApiNeighbor[] | undefined = responseData.nearestNeighbors?.[0]?.neighbors;

    if (neighbors && neighbors.length > 0) {
      const relevantNeighbors = neighbors.filter(
        (neighbor: RestApiNeighbor) => (neighbor.distance ?? 1) < MAX_DISTANCE_THRESHOLD
      );

      if (relevantNeighbors.length > 0) {
        const results = await processNeighbors(relevantNeighbors);
        if (results.length > 0) {
          console.log(`[searchKnowledgeBase] Found ${results.length} relevant results in the knowledge base.`);
          return results;
        }
      }
    }
  } catch (error: any) {
    console.error(`Error searching knowledge base:`, error);
    if (error.message.includes('PermissionDenied') || error.message.includes('IAM') || error.message.includes('403')) {
       throw new Error(`Vertex AI Search failed due to a permission issue. Please ensure the service account for your application has the "Vertex AI User" role.`);
    }
    if (error.message.includes('not found') || error.message.includes('404')) {
       throw new Error(`Vertex AI Search failed because an endpoint or index was not found. Please verify your VERTEX_AI_INDEX_ENDPOINT_ID and VERTEX_AI_DEPLOYED_INDEX_ID environment variables.`);
    }
    throw new Error(`Knowledge base search failed. Error encountered: ${error.message || 'Unknown error'}`);
  }

  console.log('[searchKnowledgeBase] No relevant results found in the knowledge base meeting the threshold.');
  return [];
}
