/**
 * @fileOverview Performs filtered, vector-based semantic search on the knowledge base.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from Firestore based on a query and filters.
 */
import { getGenkitAi } from '@/ai/genkit';
import { db, admin } from '@/lib/firebase-admin';
import type { FieldPath, WhereFilterOp } from 'firebase-admin/firestore';


// Helper function to calculate cosine similarity between two vectors
function cosineSimilarity(vecA: number[] | Float32Array, vecB: number[] | Float32Array): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface SearchResult {
  text: string;
  sourceName: string;
  level: string;
  topic: string;
  downloadURL?: string;
  similarity: number;
}

interface SearchFilters {
    level?: string[];
    topic?: string;
}

/**
 * Searches the knowledge base for text chunks semantically similar to the query,
 * applying filters for tier and topic.
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

  const queryEmbeddingVector = embeddingResponse[0]?.embedding;

  if (!queryEmbeddingVector || queryEmbeddingVector.length === 0) {
      throw new Error("Failed to generate a valid embedding for the search query.");
  }
  
  // 2. Build a filtered Firestore query.
  let chunksQuery: admin.firestore.Query = db.collection('kb_chunks');
  
  // Apply level (tier) filter. 'Archive' is always excluded unless explicitly requested (which it isn't).
  const levelsToSearch = filters.level && filters.level.length > 0 ? filters.level : ['High', 'Medium', 'Low'];
  if (levelsToSearch.length > 0) {
      chunksQuery = chunksQuery.where('level', 'in', levelsToSearch);
  } else {
      // If for some reason an empty array is passed, default to searching non-archived.
      chunksQuery = chunksQuery.where('level', 'in', ['High', 'Medium', 'Low']);
  }

  // Apply topic filter if provided.
  if (filters.topic) {
      chunksQuery = chunksQuery.where('topic', '==', filters.topic);
  }

  const querySnapshot = await chunksQuery.get();

  if (querySnapshot.empty) {
    return "No information found in the knowledge base for the specified topic/tier. The database is empty or your filters are too narrow.";
  }

  const allChunks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

  // 3. Calculate similarity for each fetched chunk in memory.
  const rankedResults: SearchResult[] = [];
  for (const chunk of allChunks) {
    if (chunk.embedding && Array.isArray(chunk.embedding.values) && chunk.embedding.values.length > 0) {
      const similarity = cosineSimilarity(queryEmbeddingVector, chunk.embedding.values);
      
      // Using a similarity threshold to ensure relevance
      if (similarity > 0.7) { 
        rankedResults.push({
          text: chunk.text,
          sourceName: chunk.sourceName,
          level: chunk.level,
          topic: chunk.topic,
          downloadURL: chunk.downloadURL,
          similarity: similarity,
        });
      }
    }
  }

  if (rankedResults.length === 0) {
    return "I found some information on related topics, but nothing that directly answers your question. Could you try rephrasing it?";
  }

  // 4. Sort by similarity and get the top K results.
  const topResults = rankedResults
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  // 5. Format the results into a single string for the prompt context.
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
