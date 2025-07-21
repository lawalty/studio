'use server';
/**
 * @fileOverview A flow for testing the knowledge base retrieval.
 *
 * - testKnowledgeBase - A function that takes a query and returns the raw context retrieved from the vector search.
 * - TestKnowledgeBaseInput - The input type for the function.
 * - TestKnowledgeBaseOutput - The return type for the function.
 */

import { z } from 'zod';
import { searchKnowledgeBase } from '@/ai/retrieval/vector-search';
import '@/ai/genkit'; // Ensures Genkit is configured

const TestKnowledgeBaseInputSchema = z.object({
  query: z.string().describe('The test query to search for in the knowledge base.'),
});
export type TestKnowledgeBaseInput = z.infer<typeof TestKnowledgeBaseInputSchema>;

// The output is now simply the raw search result array.
const TestKnowledgeBaseOutputSchema = z.array(z.object({
    sourceId: z.string(),
    text: z.string(),
    sourceName: z.string(),
    level: z.string(),
    topic: z.string(),
    downloadURL: z.string().optional(),
    distance: z.number(),
}));
export type TestKnowledgeBaseOutput = z.infer<typeof TestKnowledgeBaseOutputSchema>;


const testKnowledgeBaseFlow = async ({ query }: TestKnowledgeBaseInput): Promise<TestKnowledgeBaseOutput> => {
    // Directly call the search function and return its raw result.
    const searchResult = await searchKnowledgeBase({ query }); 
    return searchResult;
  };

export async function testKnowledgeBase(
  input: TestKnowledgeBaseInput
): Promise<TestKnowledgeBaseOutput> {
  return testKnowledgeBaseFlow(input);
}
