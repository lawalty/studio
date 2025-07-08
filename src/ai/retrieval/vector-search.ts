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
  LOCATION,
  VERTEX_AI_INDEX_ENDPOINT_ID,
  VERTEX_AI_DEPLOYED_INDEX_ID,
  VERTEX_AI_PUBLIC_ENDPOINT_DOMAIN,
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
  if (!GCLOUD_PROJECT || !LOCATION || !VERTEX_AI_INDEX_ENDPOINT_ID || !VERTEX_AI_DEPLOYED_INDEX_ID || !VERTEX_AI_PUBLIC_ENDPOINT_DOMAIN) {
    throw new Error(
      "Missing required environment variables for Vertex AI Search. Please check your .env.local file for GCLOUD_PROJECT, LOCATION, VERTEX_AI_INDEX_ENDPOINT_ID, VERTEX_AI_DEPLOYED_INDEX_ID, and VERTEX_AI_PUBLIC_ENDPOINT_DOMAIN."
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
  
  // Clean up the domain name to prevent common user errors like extra spaces or including https://
  const cleanedDomain = VERTEX_AI_PUBLIC_ENDPOINT_DOMAIN.trim().replace(/^https?:\/\//, '');

  // Construct the correct URL for a public endpoint.
  const endpointUrl = `https://${cleanedDomain}/v1/projects/${GCLOUD_PROJECT}/locations/${LOCATION}/indexEndpoints/${VERTEX_AI_INDEX_ENDPOINT_ID}:findNeighbors`;
  console.log(`[searchKnowledgeBase] Attempting to query Vertex AI at: ${endpointUrl}`);
  
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
          const errorMessage = errorBody.error?.message || JSON.stringify(errorBody);
          // A 404 error here is critical and means the URL is wrong.
          if (response.status === 404) {
              throw new Error(`The Vertex AI service returned a '404 Not Found' error. This indicates a misconfiguration in the URL path. Please verify that your GCLOUD_PROJECT, LOCATION, and VERTEX_AI_INDEX_ENDPOINT_ID in .env.local are all correct. The service could not find the specified endpoint. Raw error: ${errorMessage}`);
          }
          throw new Error(`API call failed with status ${response.status}: ${errorMessage}`);
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
        // This enhanced error logging helps diagnose low-level network issues.
        let detailedErrorMessage = error.message;
        // The 'cause' property in Node.js fetch often contains the underlying network error code.
        if (error.cause) {
            const cause = error.cause as { code?: string; message?: string };
            const errorCode = cause.code || 'Unknown Cause';
            detailedErrorMessage = `A low-level network error occurred: ${errorCode}. This often means the Public Endpoint Domain Name in your .env.local file is incorrect or unreachable. Action Required: Please double-check it for typos. You can test it by running 'ping ${cleanedDomain}' in your terminal.`;
        }
        allErrors.push(`Level '${level}': ${detailedErrorMessage}`);
    }
  }

  // If we get here, no relevant results were found in any priority level.
  if (allErrors.length > 0) {
    throw new Error(`Knowledge base search failed. Errors encountered: ${allErrors.join('; ')}`);
  }

  console.log('[searchKnowledgeBase] No relevant results found in any knowledge base meeting the threshold.');
  return [];
}
