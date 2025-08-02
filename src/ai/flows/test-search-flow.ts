
'use server';
/**
 * @fileOverview A Genkit flow for testing the vector search functionality from the client.
 * This flow provides detailed feedback on the search outcome, including enhanced diagnostics.
 */
import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { searchKnowledgeBase } from '@/ai/retrieval/vector-search';
import type { SearchResult as ClientSearchResult } from '@/ai/retrieval/vector-search';

export type SearchResult = ClientSearchResult;

const TestSearchInputSchema = z.object({
  query: z.string().min(1, "Query cannot be empty."),
  distanceThreshold: z.number().optional(),
});
export type TestSearchInput = z.infer<typeof TestSearchInputSchema>;

// An improved output schema for clearer test results.
const TestSearchOutputSchema = z.object({
  success: z.boolean().describe('Indicates if the search found at least one document.'),
  message: z.string().describe('A human-readable message describing the outcome.'),
  results: z.array(z.custom<SearchResult>()).describe('The array of search results found.'),
  error: z.string().optional().describe('A technical error message if the operation failed catastrophically.'),
  diagnostics: z.object({
      preprocessedQuery: z.string().optional(),
      queryEmbeddingGenerated: z.boolean().optional(),
      queryEmbeddingError: z.string().optional(),
      queryEmbeddingSnippet: z.array(z.number()).optional().describe("A snippet of the generated embedding vector."),
      searchError: z.string().optional().describe("Error captured during the searchKnowledgeBase call."),
  }).optional(),
});
export type TestSearchOutput = z.infer<typeof TestSearchOutputSchema>;

// This pre-processing function MUST match the one used in the indexing flow.
const preprocessText = (text: string): string => {
  if (!text) return '';
  return text
    .toLowerCase() // Convert to lowercase
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim(); // Trim leading/trailing spaces
};


export async function testSearch(input: TestSearchInput): Promise<TestSearchOutput> {
  const preprocessedQuery = preprocessText(input.query);
  const diagnostics: any = {
      preprocessedQuery,
      queryEmbeddingGenerated: false,
  };

  // **Diagnostic Step 1: Preprocessing & Embedding Generation**
  let queryEmbedding: number[] | undefined;
  try {
      const embeddingResponse = await ai.embed({
          embedder: 'googleai/text-embedding-004',
          content: preprocessedQuery,
          options: { taskType: 'RETRIEVAL_QUERY', outputDimensionality: 768 }
      });
      queryEmbedding = embeddingResponse?.[0]?.embedding;
      if (!queryEmbedding || queryEmbedding.length !== 768) {
          throw new Error(`Generated embedding was invalid or not 768 dimensions.`);
      }
      diagnostics.queryEmbeddingGenerated = true;
      diagnostics.queryEmbeddingSnippet = queryEmbedding.slice(0, 10); // Log first 10 values
  } catch (e: any) {
      diagnostics.queryEmbeddingError = e.message;
      return {
          success: false,
          message: "Failed during the query embedding generation step.",
          results: [],
          error: `Could not generate a valid vector for the test query. This points to an issue with the embedding model connection. Error: ${e.message}`,
          diagnostics,
      };
  }

  // **Diagnostic Step 2: Perform the search**
  try {
      // Use a very lenient distance threshold to ensure we see everything Firestore returns.
      const searchResults = await searchKnowledgeBase({ 
          query: input.query,
          distanceThreshold: 1.0, 
      });

      if (searchResults.length > 0) {
          const filteredResults = searchResults.filter(r => r.distance <= (input.distanceThreshold || 0.6));
          if (filteredResults.length > 0) {
              return {
                  success: true,
                  message: `Successfully found ${filteredResults.length} document(s) within the ${input.distanceThreshold || 0.6} distance threshold. Total documents found before filtering: ${searchResults.length}.`,
                  results: filteredResults,
                  diagnostics,
              };
          } else {
              return {
                  success: false,
                  message: `Found ${searchResults.length} document(s), but none were within the specified distance threshold of ${input.distanceThreshold || 0.6}. The closest match had a distance of ${searchResults[0].distance.toFixed(4)}. Try increasing the threshold.`,
                  results: searchResults,
                  diagnostics,
              };
          }
      } else {
          return {
              success: false,
              message: "The search completed but found 0 documents. The search was performed on the 'kb_chunks' collection. This indicates a core issue with either the Firestore index, the data not being in the index, or a connection problem.",
              results: [],
              diagnostics,
          };
      }
  } catch (e: any) {
      console.error('[testSearchFlow] Search test failed during searchKnowledgeBase call:', e);
      diagnostics.searchError = e.message;
      return {
          success: false,
          message: "The search query failed to execute. See the technical error below for details.",
          results: [],
          error: e.message,
          diagnostics,
      };
  }
}
