
'use server';
/**
 * @fileOverview A flow for testing the knowledge base retrieval.
 *
 * - testKnowledgeBase - A function that takes a query and returns the raw context retrieved from the vector search.
 * - TestKnowledgeBaseInput - The input type for the function.
 * - TestKnowledgeBaseOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { searchKnowledgeBase } from '../retrieval/vector-search';

const TestKnowledgeBaseInputSchema = z.object({
  query: z.string().describe('The test query to search for in the knowledge base.'),
});
export type TestKnowledgeBaseInput = z.infer<typeof TestKnowledgeBaseInputSchema>;

const TestKnowledgeBaseOutputSchema = z.object({
  retrievedContext: z.string().describe('The raw context string retrieved from the vector search, including source names and text chunks.'),
});
export type TestKnowledgeBaseOutput = z.infer<typeof TestKnowledgeBaseOutputSchema>;

export async function testKnowledgeBase(
  input: TestKnowledgeBaseInput
): Promise<TestKnowledgeBaseOutput> {
  return testKnowledgeBaseFlow(input);
}

const testKnowledgeBaseFlow = ai.defineFlow(
  {
    name: 'testKnowledgeBaseFlow',
    inputSchema: TestKnowledgeBaseInputSchema,
    outputSchema: TestKnowledgeBaseOutputSchema,
  },
  async ({ query }) => {
    // This flow directly calls the search function and returns its raw output.
    // This is useful for debugging and testing the retrieval part of the RAG pipeline.
    const context = await searchKnowledgeBase(query);
    return { retrievedContext: context };
  }
);
