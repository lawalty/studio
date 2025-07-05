/**
 * @fileOverview Performs filtered, vector-based semantic search on the knowledge base using Vertex AI Vector Search.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from a Vertex AI index based on a query and filters.
 */
import { ai } from '@/ai/genkit';
import { db } from '@/lib/firebase-admin';
import { PredictionServiceClient, protos } from '@google-cloud/aiplatform';

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
  level?: string[];
  topic?: string;
  limit?: number;
}

const {
  GCLOUD_PROJECT,
  VERTEX_AI_INDEX_ID,
  VERTEX_AI_INDEX_ENDPOINT_ID,
  LOCATION,
} = process.env;

export async function searchKnowledgeBase({
  query,
  level,
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
  const predictionServiceClient = new PredictionServiceClient(clientOptions);

  // 4. Construct filters for the search.
  const buildRestriction = (namespace: string, allow: string[]): protos.google.cloud.aiplatform.v1.IRestrict => ({
    namespace,
    allow,
  });

  const restricts: protos.google.cloud.aiplatform.v1.IRestrict[] = [];
  if (level && level.length > 0) {
    restricts.push(buildRestriction('level', level));
  }
  if (topic) {
    restricts.push(buildRestriction('topic', [topic]));
  }

  // 5. Construct the request to find nearest neighbors.
  const endpoint = `projects/${GCLOUD_PROJECT}/locations/${LOCATION}/indexEndpoints/${VERTEX_AI_INDEX_ENDPOINT_ID}`;
  const request: protos.google.cloud.aiplatform.v1.IFindNeighborsRequest = {
    indexEndpoint: endpoint,
    deployedIndexId: VERTEX_AI_INDEX_ID,
    queries: [{
      datapoint: {
        datapointId: 'query',
        featureVector: queryEmbedding,
        restrict: restricts,
      },
      neighborCount: limit,
    }],
  };

  try {
    // 6. Perform the search.
    // Use 'as any' to bypass a TypeScript build error where the method is not found in the type definitions.
    const [response] = await (predictionServiceClient as any).findNeighbors(request);
    const neighbors = response.nearestNeighbors?.[0]?.neighbors;

    if (!neighbors || neighbors.length === 0) {
      return [];
    }

    // 7. Fetch the original document data from Firestore using the IDs from the search results.
    const neighborDocs = await Promise.all(
      neighbors.map(async (neighbor: any) => {
        if (!neighbor.datapoint?.datapointId) return null;

        const docRef = db.collection('kb_chunks').doc(neighbor.datapoint.datapointId);
        const docSnap = await docRef.get();
        
        if (!docSnap.exists) return null;

        return {
          ...docSnap.data(),
          distance: neighbor.distance || 0,
        };
      })
    );

    // 8. Format the results.
    return neighborDocs
      .filter((doc): doc is SearchResult => doc !== null)
      .map((doc) => ({
        text: doc.text,
        sourceName: doc.sourceName,
        level: doc.level,
        topic: doc.topic,
        downloadURL: doc.downloadURL,
        distance: doc.distance,
      }));

  } catch (error: any) {
    console.error("Error during Vertex AI Vector Search:", error);
    if (error.message && error.message.includes('PermissionDenied')) {
        throw new Error(`Vertex AI Search failed due to a permission issue. Please ensure the service account for your application has the "Vertex AI User" role.`);
    }
    throw new Error(`An unexpected error occurred while searching the knowledge base: ${error.message}`);
  }
}
