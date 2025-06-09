
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
  input: {schema: GenerateChatResponseInputSchema}, // This schema still applies to the `promptInput` overall structure
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
{{#if this.isUser}}User: {{this.parts.[0].text}}{{/if}}
{{#if this.isModel}}AI Blair: {{this.parts.[0].text}}{{/if}}
{{/each}}
{{/if}}

Current user message: {{{userMessage}}}

When addressing the user:
- If you have learned the user's name (from the current message or the Conversation History above), and this is your *first* response in this conversation (i.e., there are no "AI Blair:" messages from you in the \\\`Conversation History\\\` provided above), greet them with "Hi [User's Name]".
- In *all other* responses, if you choose to address them by name, use *only* their name (e.g., "John, ...") without "Hi".
- If the user's name is not known, do not try to guess it. Focus on answering the query directly.

Generate a helpful and conversational response as AI Blair, strictly adhering to your persona and using only the provided knowledge base.
After providing the main information, if it feels natural for your persona and the flow of the conversation, try to ask a relevant follow-up question to keep the conversation engaging and to better understand the user's needs.
If the user's query cannot be answered from the knowledge base, politely state that you don't have information on that topic and cannot assist with that specific query, and do not ask a follow-up question in this case.
Keep your responses concise and focused on the provided knowledge.
Your response:`,
});


const generateChatResponseFlow = ai.defineFlow(
  {
    name: 'generateChatResponseFlow',
    inputSchema: GenerateChatResponseInputSchema,
    outputSchema: GenerateChatResponseOutputSchema,
  },
  async (input) => {
    const processedChatHistory = (input.chatHistory || []).map(msg => ({
      ...msg,
      isUser: msg.role === 'user',
      isModel: msg.role === 'model',
    }));

    // The promptInput will be validated against GenerateChatResponseInputSchema.
    // Zod by default passes through unknown keys, so isUser/isModel will be available to the template.
    const promptInput = {
        userMessage: input.userMessage,
        knowledgeBaseContent: input.knowledgeBaseContent,
        personaTraits: input.personaTraits,
        chatHistory: processedChatHistory,
    };

    const {output} = await prompt(promptInput);
    return output!;
  }
);

