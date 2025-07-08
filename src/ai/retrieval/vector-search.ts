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

const PRIORITY_LEVELS: Readonly<('High' | 'Medium' | 'Low')[]> = ['High', 'Medium', 'Low'];

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
  VERTEX_AI_PUBLIC_ENDPOINT_DOMAIN, // Use the public domain for the endpoint URL
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
  if (!GCLOUD_PROJECT || !VERTEX_AI_DEPLOYED_INDEX_ID || !VERTEX_AI_PUBLIC_ENDPOINT_DOMAIN) {
    throw new Error(
      "Missing required environment variables for Vertex AI Search. Please set GCLOUD_PROJECT, VERTEX_AI_DEPLOYED_INDEX_ID, and VERTEX_AI_PUBLIC_ENDPOINT_DOMAIN in your .env.local file."
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
  
  // Construct the correct URL for a public endpoint.
  const endpointUrl = `https://${VERTEX_AI_PUBLIC_ENDPOINT_DOMAIN}/v1/projects/${GCLOUD_PROJECT}:findNeighbors`;
  const allErrors: string[] = [];

  // 4. Perform prioritized, sequential search.
  for (const level of PRIORITY_LEVELS) {
    try {
      const restricts: any[] = [{ namespace: 'level', allowList: [level] }];
      if (topic) {
        restricts.push({ namespace: 'topic', allowList: [topic] });
      }

      const requestBody = {
        deployedIndexId: VERTEX_AI_DEPLOYED_INDEX_ID,
        queries: [{
          datapoint: {
            datapointId: `query-${level}`,
            featureVector: queryEmbedding,
            restricts: restricts,
          },
          neighborCount: limit,
        }],
      };
      
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
          if (response.status === 501) {
              const endpointDomain = process.env.VERTEX_AI_PUBLIC_ENDPOINT_DOMAIN;
              throw new Error(`The Vertex AI service returned a '501 Not Implemented' error. This indicates the Index Endpoint is not correctly configured or the public domain name is incorrect. Action Required: 1. Verify that the VERTEX_AI_PUBLIC_ENDPOINT_DOMAIN in your .env.local file matches the 'Public domain name' in your Google Cloud Console. 2. Verify that the endpoint is active and the index is correctly deployed. 3. Confirm that the endpoint is a Public Endpoint.`);
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
            console.log(`[searchKnowledgeBase] Found ${results.length} relevant results in '${level}' priority knowledge base.`);
            return results; // Found results, so return immediately.
          }
        }
      }
    } catch (error: any) {
        // Collect errors from each level to provide a full report if all levels fail.
        allErrors.push(`Level '${level}': ${error.message}`);
    }
  }

  // If we get here, no relevant results were found in any priority level.
  if (allErrors.length > 0) {
    throw new Error(`Knowledge base search failed. Errors encountered: ${allErrors.join('; ')}`);
  }

  console.log('[searchKnowledgeBase] No relevant results found in any knowledge base meeting the threshold.');
  return [];
}
