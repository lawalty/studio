
'use server';
/**
 * @fileOverview Generates a conversational response for AI Blair.
 *
 * - generateChatResponse - A function that generates a chat response.
 * - GenerateChatResponseInput - The input type for the generateChatResponse function.
 * - GenerateChatResponseOutput - The return type for the generateChatResponse function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Define a schema for individual chat messages for history
const ChatMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  parts: z.array(z.object({ text: z.string() })),
});

const GenerateChatResponseInputSchema = z.object({
  userMessage: z.string().describe('The latest message from the user.'),
  knowledgeBaseContent: z
    .string()
    .describe('The knowledge base content AI Blair should use to answer questions.'),
  personaTraits: z
    .string()
    .describe("The persona traits that define AI Blair's conversational style."),
  chatHistory: z.array(ChatMessageSchema).describe('The history of the conversation so far.').optional(),
});
export type GenerateChatResponseInput = z.infer<typeof GenerateChatResponseInputSchema>;

const GenerateChatResponseOutputSchema = z.object({
  aiResponse: z.string().describe("AI Blair's generated response."),
});
export type GenerateChatResponseOutput = z.infer<typeof GenerateChatResponseOutputSchema>;

export async function generateChatResponse(
  input: GenerateChatResponseInput
): Promise<GenerateChatResponseOutput> {
  return generateChatResponseFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateChatResponsePrompt',
  input: {schema: GenerateChatResponseInputSchema},
  output: {schema: GenerateChatResponseOutputSchema},
  prompt: `You are AI Blair. Your personality and style are defined by the following traits:
{{{personaTraits}}}

You must answer user questions based on the following knowledge base content:
<knowledge_base>
{{{knowledgeBaseContent}}}
</knowledge_base>

{{#if chatHistory.length}}
Conversation History:
{{#each chatHistory}}
{{#if (eq this.role "user")}}User: {{this.parts.[0].text}}{{/if}}
{{#if (eq this.role "model")}}AI Blair: {{this.parts.[0].text}}{{/if}}
{{/each}}
{{/if}}

Current user message: {{{userMessage}}}

Generate a helpful and conversational response as AI Blair, strictly adhering to your persona and using only the provided knowledge base. If the user's query cannot be answered from the knowledge base, politely state that you don't have information on that topic and cannot assist with that specific query. Keep your responses concise and focused on the provided knowledge.
Your response:`,
});


const generateChatResponseFlow = ai.defineFlow(
  {
    name: 'generateChatResponseFlow',
    inputSchema: GenerateChatResponseInputSchema,
    outputSchema: GenerateChatResponseOutputSchema,
  },
  async (input) => {
    const promptInput: GenerateChatResponseInput = {
        userMessage: input.userMessage,
        knowledgeBaseContent: input.knowledgeBaseContent,
        personaTraits: input.personaTraits,
        chatHistory: input.chatHistory || [], 
    };

    const {output} = await prompt(promptInput);
    return output!;
  }
);
