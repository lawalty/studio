// 'use server';

/**
 * @fileOverview Summarizes the knowledge base content for display on the landing page.
 *
 * - summarizeKnowledgeBase - A function that summarizes the knowledge base content.
 * - SummarizeKnowledgeBaseInput - The input type for the summarizeKnowledgeBase function.
 * - SummarizeKnowledgeBaseOutput - The return type for the summarizeKnowledgeBase function.
 */

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeKnowledgeBaseInputSchema = z.object({
  knowledgeBaseContent: z
    .string()
    .describe('The combined content of the knowledge base.'),
});
export type SummarizeKnowledgeBaseInput = z.infer<
  typeof SummarizeKnowledgeBaseInputSchema
>;

const SummarizeKnowledgeBaseOutputSchema = z.object({
  summary: z.string().describe('A short summary of the knowledge base.'),
});
export type SummarizeKnowledgeBaseOutput = z.infer<
  typeof SummarizeKnowledgeBaseOutputSchema
>;

export async function summarizeKnowledgeBase(
  input: SummarizeKnowledgeBaseInput
): Promise<SummarizeKnowledgeBaseOutput> {
  return summarizeKnowledgeBaseFlow(input);
}

const summarizeKnowledgeBasePrompt = ai.definePrompt({
  name: 'summarizeKnowledgeBasePrompt',
  input: {schema: SummarizeKnowledgeBaseInputSchema},
  output: {schema: SummarizeKnowledgeBaseOutputSchema},
  prompt: `You are an expert summarizer. Please summarize the following knowledge base content in a short, concise paragraph to entice users to start a conversation with AI Blair:\n\nKnowledge Base Content:\n{{{knowledgeBaseContent}}}\n\nSummary: `,
});

const summarizeKnowledgeBaseFlow = ai.defineFlow(
  {
    name: 'summarizeKnowledgeBaseFlow',
    inputSchema: SummarizeKnowledgeBaseInputSchema,
    outputSchema: SummarizeKnowledgeBaseOutputSchema,
  },
  async input => {
    const {output} = await summarizeKnowledgeBasePrompt(input);
    return output!;
  }
);
