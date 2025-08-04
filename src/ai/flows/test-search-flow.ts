
'use server';
/**
 * @fileOverview A Genkit flow for testing the vector search functionality from the client.
 * This flow provides detailed feedback on the search outcome.
 */
import { z } from 'zod';
import { searchKnowledgeBase } from '@/ai/retrieval/vector-search';
import type { SearchResult as ClientSearchResult } from '@/ai/retrieval/vector-search';

export type SearchResult = ClientSearchResult;

const TestSearchInputSchema = z.object({
  query: z.string().min(1, "Query cannot be empty."),
  distanceThreshold: z.number().optional(),
});
export type TestSearchInput = z.infer<typeof TestSearchInputSchema>;

const TestSearchOutputSchema = z.object({
  success: z.boolean().describe('Indicates if the search found at least one document.'),
  message: z.string().describe('A human-readable message describing the outcome.'),
  results: z.array(z.custom<SearchResult>()).describe('The array of search results found.'),
  error: z.string().optional().describe('A technical error message if the operation failed catastrophically.'),
});
export type TestSearchOutput = z.infer<typeof TestSearchOutputSchema>;

export async function testSearch(input: TestSearchInput): Promise<TestSearchOutput> {
  try {
      // The distance threshold for the test should be lenient to see what Firestore returns.
      // The filtering will happen based on the user's slider input.
      const searchResults = await searchKnowledgeBase({ 
          query: input.query,
          distanceThreshold: 1.0, // Use a very lenient threshold for the raw search
      });

      if (searchResults.length > 0) {
          const distanceThreshold = input.distanceThreshold || 0.6;
          const filteredResults = searchResults.filter(r => r.distance <= distanceThreshold);

          if (filteredResults.length > 0) {
              return {
                  success: true,
                  message: `Successfully found ${filteredResults.length} document(s) within the ${distanceThreshold} distance threshold. Total documents found before filtering: ${searchResults.length}.`,
                  results: filteredResults,
              };
          } else {
              return {
                  success: false,
                  message: `Found ${searchResults.length} document(s), but none were within the specified distance threshold of ${distanceThreshold}. The closest match had a distance of ${searchResults[0].distance.toFixed(4)}. Try increasing the threshold.`,
                  results: searchResults, // Return all results so user can see what was found
              };
          }
      } else {
          return {
              success: false,
              message: "The search completed but found 0 documents from the 'kb_chunks' collection group. This means the query against the index returned nothing. Check if the document was indexed successfully and if the index is active.",
              results: [],
          };
      }
  } catch (e: any) {
      console.error('[testSearchFlow] Search test failed during searchKnowledgeBase call:', e);
      return {
          success: false,
          message: "The search query failed to execute. This often points to a problem with the Firestore index itself or the service account permissions.",
          results: [],
          error: e.message,
      };
  }
}
