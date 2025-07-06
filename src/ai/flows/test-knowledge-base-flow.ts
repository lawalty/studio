
'use server';
/**
 * @fileOverview A flow for testing the knowledge base retrieval.
 *
 * - testKnowledgeBase - A function that takes a query and returns the raw context retrieved from the vector search.
 * - TestKnowledgeBaseInput - The input type for the function.
 * - TestKnowledgeBaseOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { searchKnowledgeBase } from '../retrieval/vector-search';

const TestKnowledgeBaseInputSchema = z.object({
  query: z.string().describe('The test query to search for in the knowledge base.'),
  level: z.array(z.string()).optional().describe('The priority levels to filter the search by (e.g., ["High", "Medium"]).'),
});
export type TestKnowledgeBaseInput = z.infer<typeof TestKnowledgeBaseInputSchema>;

const TestKnowledgeBaseOutputSchema = z.object({
  retrievedContext: z.string().describe('The raw context string retrieved from the vector search, including source names and text chunks.'),
  searchResult: z.any().describe('The raw search result object from the vector search.'),
});
export type TestKnowledgeBaseOutput = z.infer<typeof TestKnowledgeBaseOutputSchema>;


const testKnowledgeBaseFlow = ai.defineFlow(
  {
    name: 'testKnowledgeBaseFlow',
    inputSchema: TestKnowledgeBaseInputSchema,
    outputSchema: TestKnowledgeBaseOutputSchema,
  },
  async ({ query, level }) => {
    // Perform a search with optional filters for testing purposes
    const searchResult = await searchKnowledgeBase({ query, level }); 
    const contextString = `Here is some context I found that might be relevant to the user's question. Use this information to form your answer.
---
${searchResult.map(r =>
    `Context from document "${r.sourceName}" (Topic: ${r.topic}, Priority: ${r.level}):
${r.text}
${(r.sourceName && r.sourceName.toLowerCase().endsWith('.pdf') && r.downloadURL) ? `(Reference URL for this chunk's source PDF: ${r.downloadURL})` : ''}`
  ).join('\n---\n')}
---
Based on this context, please answer the user's question.
`;
    return { retrievedContext: contextString, searchResult };
  }
);

export async function testKnowledgeBase(
  input: TestKnowledgeBaseInput
): Promise<TestKnowledgeBaseOutput> {
  return testKnowledgeBaseFlow(input);
}

    