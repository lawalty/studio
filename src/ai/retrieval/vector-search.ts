
'use server';
/**
 * @fileOverview Performs vector-based semantic search on the knowledge base.
 *
 * - searchKnowledgeBase - Finds relevant text chunks from Firestore based on a query.
 */

import { ai } from '@/ai/genkit';
import { getFirestore } from 'firebase-admin/firestore'; // Correct: Use Admin SDK for server-side
import { textEmbedding004 } from '@genkit-ai/googleai';

// Initialize Admin Firestore. Genkit's Firebase plugin handles app initialization.
const db = getFirestore();

// Helper function to calculate cosine similarity between two vectors
function cosineSimilarity(vecA: number[] | Float32Array, vecB: number[] | Float32Array): number {
  if (vecA.length !== vecB.length) {
    return 0; // Or throw an error
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
  downloadURL: string | undefined; // PDFs will have this
  similarity: number;
}

/**
 * Searches the knowledge base for text chunks semantically similar to the query.
 *
 * WARNING: This implementation fetches ALL chunks from Firestore and performs the
 * similarity calculation in memory. This is NOT scalable for large knowledge bases.
 * For production use, a true vector database or a managed service with vector search
 * capabilities (like Firestore's native Vector Search, currently in preview) is
 * strongly recommended.
 *
 * @param query The user's search query.
 * @param topK The number of top results to return.
 * @returns A formatted string of the top K results, or a message if none are found.
 */
export async function searchKnowledgeBase(query: string, topK: number = 5): Promise<string> {
  // 1. Generate an embedding for the user's query using the primary 'ai' instance
  const { embedding } = await ai.embed({
    embedder: textEmbedding004,
    content: query,
    taskType: 'RETRIEVAL_QUERY',
  });

  // 2. Fetch all chunks from Firestore using the Admin SDK
  const chunksCollectionRef = db.collection('kb_chunks');
  const querySnapshot = await chunksCollectionRef.get();

  if (querySnapshot.empty) {
    return "No information found in the knowledge base.";
  }

  const allChunks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

  // 3. Calculate similarity for each chunk and store the results
  const rankedResults: SearchResult[] = [];
  for (const chunk of allChunks) {
    // Use a more lenient check for the embedding that supports TypedArrays.
    if (chunk.embedding?.length > 0) {
      const similarity = cosineSimilarity(embedding, chunk.embedding);
      
      // We can define a threshold to filter out irrelevant results
      if (similarity > 0.7) { // Example threshold
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

  // 4. Sort by similarity and get top K results
  const topResults = rankedResults
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  if (topResults.length === 0) {
    return "I found some information on related topics, but nothing that directly answers your question. Could you try rephrasing it?";
  }

  // 5. Format the results into a single string for the prompt context
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
