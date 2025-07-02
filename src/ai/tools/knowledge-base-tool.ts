/**
 * @fileOverview Defines a Genkit tool for searching the knowledge base.
 * This allows the AI agent to decide when to search for information.
 */

import ai from '@/ai/genkit';
import { z } from 'genkit';
import { searchKnowledgeBase } from '../retrieval/vector-search';

export const knowledgeBaseSearchTool = ai.defineTool(
  {
    name: 'knowledgeBaseSearch',
    description: 'Searches the knowledge base for information to answer a user\'s question. Use this whenever you need specific details, procedures, or data.',
    inputSchema: z.object({
      query: z.string().describe('The user\'s question or the specific information you are looking for.'),
      topic: z.string().optional().describe('Filter the search to a specific topic category if relevant.'),
      level: z.array(z.string()).optional().describe('Filter by one or more priority levels (High, Medium, Low). Defaults to all.'),
    }),
    outputSchema: z.string().describe('The retrieved context from the knowledge base.'),
  },
  async (input) => {
    console.log(`[knowledgeBaseSearchTool] Searching for query: "${input.query}" with filters:`, input);
    try {
      const context = await searchKnowledgeBase(input.query, {
        level: input.level,
        topic: input.topic,
      });
      return context;
    } catch (error: any) {
        console.error('[knowledgeBaseSearchTool] Error:', error);
        return `An error occurred while searching the knowledge base: ${error.message}`;
    }
  }
);
