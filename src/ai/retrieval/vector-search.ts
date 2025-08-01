
'use server';
/**
 * @fileOverview Performs a vector-based semantic search using a dedicated
 * Google Cloud Vertex AI Vector Search endpoint. This provides a more robust
 * and scalable search than Firestore's native vector search.
 */
import { admin } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit';
import { IndexEndpointServiceClient, helpers } from '@google-cloud/aiplatform';

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
  distanceThreshold?: number; // Note: Vertex AI uses this differently. 0 is identical, higher is less similar.
}

// Pre-processing MUST match the one used during indexing.
const preprocessText = (text: string): string => {
  if (!text) return '';
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
};

export async function searchKnowledgeBase({
  query,
  limit = 10,
}: SearchParams): Promise<SearchResult[]> {

  // =================================================================================
  // 1. VERIFY ENVIRONMENT VARIABLES
  // =================================================================================
  const {
    GCLOUD_PROJECT,
    LOCATION,
    VERTEX_AI_INDEX_ID,
    VERTEX_AI_INDEX_ENDPOINT_ID,
    VERTEX_AI_DEPLOYED_INDEX_ID,
    VERTEX_AI_PUBLIC_ENDPOINT_DOMAIN,
  } = process.env;

  const requiredEnvVars = {
    GCLOUD_PROJECT, LOCATION, VERTEX_AI_INDEX_ID,
    VERTEX_AI_INDEX_ENDPOINT_ID, VERTEX_AI_DEPLOYED_INDEX_ID,
    VERTEX_AI_PUBLIC_ENDPOINT_DOMAIN,
  };

  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      throw new Error(`CRITICAL: The environment variable '${key}' is not set. The application cannot connect to the Vertex AI Vector Search endpoint. Please verify your .env.local file or App Hosting secret configuration.`);
    }
  }

  // =================================================================================
  // 2. GENERATE THE QUERY EMBEDDING
  // =================================================================================
  // This step is identical to the previous method: create an embedding for the user's query.
  const processedQuery = preprocessText(query);
  const embeddingResponse = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: processedQuery,
    options: { taskType: 'RETRIEVAL_QUERY', outputDimensionality: 768 }
  });

  const queryEmbedding = embeddingResponse?.[0]?.embedding;
  if (!queryEmbedding || queryEmbedding.length !== 768) {
    throw new Error(`Failed to generate a valid 768-dimension embedding for the query.`);
  }

  // =================================================================================
  // 3. CONNECT TO THE VERTEX AI ENDPOINT AND PERFORM THE SEARCH
  // =================================================================================
  const clientOptions = { apiEndpoint: `${LOCATION}-aiplatform.googleapis.com` };
  const indexEndpointClient = new IndexEndpointServiceClient(clientOptions);

  const endpointName = indexEndpointClient.indexEndpointPath(GCLOUD_PROJECT!, LOCATION!, VERTEX_AI_INDEX_ENDPOINT_ID!);
  const datapoint = {
      datapointId: 'query-id', // A temporary ID for this query
      featureVector: queryEmbedding,
  };
  
  const findNeighborsRequest = {
    indexEndpoint: endpointName,
    deployedIndexId: VERTEX_AI_DEPLOYED_INDEX_ID!,
    queries: [{ datapoint }],
    returnFullDatapoint: false, // We only need the IDs
  };

  let searchResponse;
  try {
      [searchResponse] = await indexEndpointClient.findNeighbors(findNeighborsRequest);
  } catch(e: any) {
      console.error('[VertexSearch] Error calling findNeighbors:', e);
      let detail = "An unexpected error occurred with the Vertex AI service.";
      if (e.message?.includes('permission denied')) {
          detail = `A permissions error occurred. Please ensure your service account has the "Vertex AI User" role in the Google Cloud Console.`;
      } else if (e.message?.includes('not found')) {
          detail = `The Vertex AI endpoint, index, or deployment was not found. Please verify all VERTEX_AI_* IDs in your environment configuration.`;
      }
      throw new Error(`[VertexSearch] ${detail} Raw Error: ${e.message}`);
  }
  
  const neighbors = searchResponse?.nearestNeighbors?.[0]?.neighbors || [];
  const chunkIds = neighbors.map(neighbor => neighbor.datapoint?.datapointId).filter((id): id is string => !!id);

  if (chunkIds.length === 0) {
    return [];
  }

  // =================================================================================
  // 4. RETRIEVE THE DOCUMENT CHUNKS FROM FIRESTORE USING THE IDs
  // =================================================================================
  // Vertex AI returns the IDs of the closest matches. Now we fetch the actual
  // document chunks from Firestore using those IDs.
  const firestore = admin.firestore();
  const chunksCollection = firestore.collection('kb_chunks');
  
  // Firestore 'in' query is limited to 30 items per query. We batch them.
  const results: SearchResult[] = [];
  const idToDistanceMap = new Map<string, number>();
  neighbors.forEach(n => {
    if (n.datapoint?.datapointId && n.distance) {
      idToDistanceMap.set(n.datapoint.datapointId, n.distance);
    }
  });

  const batches: string[][] = [];
  for (let i = 0; i < chunkIds.length; i += 30) {
      batches.push(chunkIds.slice(i, i + 30));
  }

  for (const batch of batches) {
      if (batch.length === 0) continue;
      const querySnapshot = await chunksCollection.where(admin.firestore.FieldPath.documentId(), 'in', batch).get();
      querySnapshot.forEach(doc => {
          const data = doc.data();
          const distance = idToDistanceMap.get(doc.id) || 0;
          results.push({
            // Note: The distance here is from Vertex, not Firestore. Lower is more similar.
            distance: distance,
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
      });
  }

  // Sort final results by distance as returned by Vertex AI
  results.sort((a, b) => a.distance - b.distance);

  return results.slice(0, limit);
}
