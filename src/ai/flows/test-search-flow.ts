
'use server';
/**
 * @fileOverview A Genkit flow for testing the vector search functionality from the client.
 *
 * - testSearch - The main function to trigger the search test.
 * - SearchResult - The type for a single search result.
 * - TestSearchInput - The input type for the function.
 * - TestSearchOutput - The return type for the function.
 */
import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { searchKnowledgeBase } from '@/ai/retrieval/vector-search';
import type { SearchResult as ClientSearchResult } from '@/ai/retrieval/vector-search';

// This is the same interface as in vector-search, but exported for the client.
export type SearchResult = ClientSearchResult;

const TestSearchInputSchema = z.object({
  query: z.string().min(1, "Query cannot be empty."),
  distanceThreshold: z.number().optional(),
});
export type TestSearchInput = z.infer<typeof TestSearchInputSchema>;

const TestSearchOutputSchema = z.object({
  results: z.array(z.custom<SearchResult>()).describe('The array of search results.'),
  error: z.string().optional().describe('An error message if the operation failed.'),
});
export type TestSearchOutput = z.infer<typeof TestSearchOutputSchema>;

export async function testSearch(input: TestSearchInput): Promise<TestSearchOutput> {
  try {
    const searchResults = await searchKnowledgeBase({ 
        query: input.query,
        distanceThreshold: input.distanceThreshold,
    });
    return { results: searchResults };
  } catch (e: any) {
    console.error('[testSearchFlow] Search test failed:', e);
    const errorMessage = e.message || "An unknown error occurred during the search test.";
    return { results: [], error: errorMessage };
  }
}

    