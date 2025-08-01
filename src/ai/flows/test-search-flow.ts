
'use server';
/**
 * @fileOverview A Genkit flow for testing the vector search functionality from the client.
 * This flow provides detailed feedback on the search outcome.
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
  try {
    // The `searchKnowledgeBase` function now handles its own preprocessing.
    // We can pass the raw query directly to it.
    const searchResults = await searchKnowledgeBase({ 
        query: input.query, // Pass the raw query
        distanceThreshold: input.distanceThreshold || 0.6,
    });

    if (searchResults.length > 0) {
      return {
        success: true,
        message: `Successfully found ${searchResults.length} relevant document(s).`,
        results: searchResults,
      };
    } else {
      return {
        success: false, // Explicitly false as no documents were found.
        message: "The search completed but found 0 documents. This may be due to a strict distance threshold, or the query may not match content in your knowledge base.",
        results: [],
      };
    }

  } catch (e: any) {
    console.error('[testSearchFlow] Search test failed:', e);
    const errorMessage = e.message || "An unknown error occurred during the search test.";
    return {
      success: false,
      message: "The search query failed to execute. See the technical error below for details.",
      results: [],
      error: errorMessage,
    };
  }
}
