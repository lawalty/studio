
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

Regarding greetings and addressing the user by name:
1.  **Examine the 'Conversation History' provided above.**
2.  **If the 'Conversation History' ALREADY CONTAINS ANY message starting with "AI Blair:":**
    *   This means you (AI Blair) have spoken before in this interaction. This is a follow-up response.
    *   In this case, if you choose to address the user by their name (e.g., if they've told you their name like "Bob"), use ONLY their name. For example: "Bob, I can help with that."
    *   DO NOT use "Hi [User's Name]" in these follow-up responses.
3.  **If the 'Conversation History' contains NO messages starting with "AI Blair:":**
    *   This means this is your VERY FIRST utterance in this entire conversation.
    *   If you learn the user's name from their \`Current user message\` (e.g., they say "My name is Bob"), then greet them with "Hi [User's Name]". For example: "Hi Bob, how can I assist you today?".
    *   If you do not learn their name in their first message, provide a general, brief opening statement or proceed to answer if the query is direct.
4.  **If the user's name is not known** at any point you might address them, do not try to guess it. Focus on answering the query directly.

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

