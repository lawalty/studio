
'use server';
/**
 * @fileOverview A Genkit flow for testing the vector search functionality.
 */
import { defineFlow, runFlow } from '@genkit-ai/flow';
import { searchKnowledgeBase } from '@/ai/retrieval/vector-search';
import { z } from 'zod';

export const testSearchFlow = defineFlow(
  {
    name: 'testSearchFlow',
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.any(),
  },
  async ({ query }) => {
    console.log(`Running search for query: "${query}"`);

    const searchResults = await searchKnowledgeBase({ query });

    console.log('Search results:');
    console.log(JSON.stringify(searchResults, null, 2));

    return searchResults;
  }
);
