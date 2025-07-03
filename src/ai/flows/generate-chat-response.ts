
'use server';
/**
 * @fileOverview A Genkit flow that generates a chat response from an AI model.
 * It uses a retrieval-augmented generation (RAG) approach by first searching a
 * knowledge base and then providing that context to the AI to formulate an answer.
 */
import { getGenkitAi } from '@/ai/genkit';
import { z } from 'zod';
import { searchKnowledgeBase } from '../retrieval/vector-search';

// Zod schema for the input of the generateChatResponse flow.
export const GenerateChatResponseInputSchema = z.object({
  userMessage: z.string().describe('The message sent by the user.'),
  personaTraits: z.string().describe("A summary of the AI's personality and character traits."),
  conversationalTopics: z.string().describe("A comma-separated list of topics the AI is an expert in."),
  chatHistory: z.array(z.object({
    role: z.enum(['user', 'model']),
    parts: z.array(z.object({
      text: z.string(),
    })),
  })).optional().describe('The history of the conversation so far.'),
});
export type GenerateChatResponseInput = z.infer<typeof GenerateChatResponseInputSchema>;

// Zod schema for the output of the generateChatResponse flow.
const GenerateChatResponseOutputSchema = z.object({
  aiResponse: z.string().describe("The AI's generated response."),
  shouldEndConversation: z.boolean().describe('Indicates whether the conversation should end based on the AI response.'),
  pdfReference: z.object({
    fileName: z.string(),
    downloadURL: z.string(),
  }).optional().describe('A reference to a PDF document if the AI response is based on one.'),
});
export type GenerateChatResponseOutput = z.infer<typeof GenerateChatResponseOutputSchema>;

// Schema for the prompt input, including the retrieved context.
const ChatPromptInputSchema = GenerateChatResponseInputSchema.extend({
  context: z.string().describe("Relevant information from the knowledge base."),
});


export async function generateChatResponse(
  input: GenerateChatResponseInput
): Promise<GenerateChatResponseOutput> {
  const ai = await getGenkitAi();

  const generateChatResponseFlow = ai.defineFlow(
    {
      name: 'generateChatResponseFlow',
      inputSchema: GenerateChatResponseInputSchema,
      outputSchema: GenerateChatResponseOutputSchema,
    },
    async ({ userMessage, personaTraits, conversationalTopics, chatHistory }) => {

      // Step 1: Search the knowledge base for relevant information.
      // We pass an empty filter object to search all available topics and levels.
      const context = await searchKnowledgeBase(userMessage, {});

      // Step 2: Define the prompt for the AI model, now including the retrieved knowledge.
      const chatPrompt = ai.definePrompt({
        name: 'chatResponsePrompt',
        input: { schema: ChatPromptInputSchema },
        output: { schema: GenerateChatResponseOutputSchema },
        prompt: `You are a conversational AI. Your persona is defined by these traits: "{{personaTraits}}".
Your primary areas of expertise are: "{{conversationalTopics}}".
You are having a conversation with a user.

Here is some information retrieved from your knowledge base that might be relevant:
---
{{{context}}}
---

CRITICAL INSTRUCTIONS:
1. Analyze the user's message: "{{userMessage}}".
2. Review the provided context.
3. If the context is relevant and helps answer the question, use it to formulate your response.
4. If the context is not relevant, or if no context is provided, respond conversationally based on your defined persona and general knowledge. Do NOT mention that you searched the knowledge base and found nothing.
5. If you don't know the answer, just say so politely.
6. Your response must be a JSON object with two fields: "aiResponse" (a string) and "shouldEndConversation" (a boolean).
`,
      });

      // Step 3: Call the LLM with all the necessary information.
      try {
        const output = await chatPrompt(
          { userMessage, personaTraits, conversationalTopics, chatHistory, context },
          {
            history: chatHistory,
            config: {
              temperature: 0.2,
            },
          }
        );

        if (!output || typeof output.aiResponse !== 'string') {
          console.error('[generateChatResponseFlow] Invalid or malformed output from prompt.', output);
          return {
            aiResponse: "I seem to have lost my train of thought! Could you please try sending your message again?",
            shouldEndConversation: false,
          };
        }

        // The logic for PDF references is simplified, as the context string contains the necessary info.
        // For now, we return the text response. Future work could parse the context to extract specific URLs.
        return output;

      } catch (error: any) {
        console.error('[generateChatResponseFlow] Error calling AI model:', error);
        let userFriendlyMessage = "I'm having a bit of trouble connecting to my brain right now. Please try again in a moment.";

        if (error.message && error.message.includes('API key not valid')) {
          userFriendlyMessage = "There seems to be an issue with my connection to Google. Please check the API key configuration.";
        } else if (error.message && error.message.includes('permission')) {
          userFriendlyMessage = "It looks like I don't have the right permissions to access some information. This is a configuration issue.";
        }

        return {
          aiResponse: userFriendlyMessage,
          shouldEndConversation: false,
        };
      }
    }
  );

  return generateChatResponseFlow(input);
}
