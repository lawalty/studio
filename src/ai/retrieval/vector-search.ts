/**
 * @fileOverview Performs filtered, vector-based semantic search on the knowledge base using the Firestore Vector Search extension.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from Firestore based on a query and filters.
 */
import { getGenkitAi } from '@/ai/genkit';
import { db } from '@/lib/firebase-admin';

interface SearchResult {
  text: string;
  sourceName: string;
  level: string;
  topic: string;
  downloadURL?: string;
  distance: number;
}

interface SearchFilters {
  level?: string[];
  topic?: string;
}

/**
 * Searches the knowledge base for text chunks semantically similar to the query,
 * applying filters for tier and topic using the Firestore Vector Search extension.
 * @param query The user's search query.
 * @param filters An object with optional 'level' (array of strings) and 'topic' (string) to filter by.
 * @param topK The number of top results to return.
 * @returns A formatted string of the top K results, or a message if none are found.
 */
export async function searchKnowledgeBase(query: string, filters: SearchFilters, topK: number = 5): Promise<string> {
  const ai = await getGenkitAi();

  // 1. Generate an embedding for the user's query.
  const embeddingResponse = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: query,
  });

  const queryEmbedding = embeddingResponse[0]?.embedding;

  if (!queryEmbedding) {
    throw new Error("Failed to generate a valid embedding for the search query.");
  }

  // 2. Build the filter for the vector search.
  const queryFilter: any = {};

  // Apply level (tier) filter. 'Archive' is always excluded.
  const levelsToSearch = filters.level && filters.level.length > 0 ? filters.level : ['High', 'Medium', 'Low'];
  queryFilter.level = { $in: levelsToSearch };

  // Apply topic filter if provided.
  if (filters.topic) {
    queryFilter.topic = { $eq: filters.topic };
  }

  // 3. Perform the vector search using the Firestore extension.
  const searchResults = await db.collection('kb_chunks').findNearest('embedding', {
    vector: queryEmbedding,
    limit: topK,
    distanceMeasure: 'COSINE',
    filter: queryFilter,
  });

  if (searchResults.empty) {
    return "No information found in the knowledge base for the specified topic/tier. The database is empty or your filters are too narrow.";
  }

  const topResults: SearchResult[] = searchResults.docs.map(doc => {
    const data = doc.data();
    return {
      text: data.text,
      sourceName: data.sourceName,
      level: data.level,
      topic: data.topic,
      downloadURL: data.downloadURL,
      distance: doc.distance,
    };
  });

  if (topResults.length === 0) {
    return "I found some information on related topics, but nothing that directly answers your question. Could you try rephrasing it?";
  }

  // 4. Format the results into a single string for the prompt context.
  return `Here is some context I found that might be relevant to the user's question. Use this information to form your answer.
---
${topResults.map(r =>
    `Context from document "${r.sourceName}" (Topic: ${r.topic}, Priority: ${r.level}):
${r.text}
${(r.sourceName && r.sourceName.toLowerCase().endsWith('.pdf') && r.downloadURL) ? `(Reference URL for this chunk's source PDF: ${r.downloadURL})` : ''}`
  ).join('\n---\n')}
---
Based on this context, please answer the user's question.
`;
}
