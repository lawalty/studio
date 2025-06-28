'use server';
/**
 * @fileOverview Performs vector-based semantic search on the knowledge base.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from Firestore based on a query.
 */
import { ai } from '@/ai/genkit';
import * as admin from 'firebase-admin';

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
  downloadURL?: string;
  similarity: number;
}

/**
 * Searches the knowledge base for text chunks semantically similar to the query.
 *
 * WARNING: This implementation fetches ALL chunks from Firestore and performs the
 * similarity calculation in memory. This is NOT scalable for large knowledge bases.
 * For production use, this should be replaced with a true vector query against
 * Firestore once the Vector Search extension is fully configured and indexed.
 *
 * @param query The user's search query.
 * @param topK The number of top results to return.
 * @returns A formatted string of the top K results, or a message if none are found.
 */
export async function searchKnowledgeBase(query: string, topK: number = 5): Promise<string> {
  // Initialize Firebase Admin SDK if it hasn't been already.
  // It will use Application Default Credentials from the environment.
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }
  
  // 1. Generate an embedding for the user's query using the Genkit AI SDK.
  const queryEmbedding = await ai.embed({
      model: 'googleai/text-embedding-004',
      content: query,
      taskType: 'RETRIEVAL_QUERY',
  });

  if (!queryEmbedding) {
      throw new Error("Failed to generate an embedding for the search query.");
  }
  
  // 2. Fetch all chunks from the Firestore collection.
  const db = admin.firestore();
  const chunksCollectionRef = db.collection('kb_chunks');
  const querySnapshot = await chunksCollectionRef.get();

  if (querySnapshot.empty) {
    return "No information found in the knowledge base. The database is empty.";
  }

  const allChunks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

  // 3. Calculate similarity for each chunk in memory.
  const rankedResults: SearchResult[] = [];
  for (const chunk of allChunks) {
    // The 'embedding' field is added by the Firestore Vector Search extension.
    // If it doesn't exist, the extension hasn't processed this chunk yet.
    if (chunk.embedding && Array.isArray(chunk.embedding.values) && chunk.embedding.values.length > 0) {
      const similarity = cosineSimilarity(queryEmbedding, chunk.embedding.values);
      
      // Filter out results that are not very similar.
      if (similarity > 0.7) { 
        rankedResults.push({
          text: chunk.text,
          sourceName: chunk.sourceName,
          level: chunk.level,
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
  `Context from document "${r.sourceName}" (Priority: ${r.level}):
${r.text}
${(r.sourceName && r.sourceName.toLowerCase().endsWith('.pdf') && r.downloadURL) ? `(Reference URL for this chunk's source PDF: ${r.downloadURL})` : ''}`
).join('\n---\n')}
---
Based on this context, please answer the user's question.
`;
}
