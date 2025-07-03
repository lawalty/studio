
'use server';
/**
 * @fileOverview A Genkit flow that generates a chat response from an AI model.
 *
 * This flow is designed to be the central point for generating conversational
 * AI responses. It takes the user's message, persona traits for the AI,
 * conversational topics, and chat history as input.
 *
 * It uses a prompt that instructs the AI on how to behave, incorporating
 * the provided persona and topics. The chat history is also included to
 * give the AI context of the ongoing conversation.
 *
 * The flow returns the AI's generated response as a string and a boolean
 * flag indicating whether the conversation should end.
 */
import { getGenkitAi } from '@/ai/genkit';
import { z } from 'zod';
import { type Message } from '@/components/chat/ChatInterface';
import { vectorSearch } from '../retrieval/vector-search';

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


// This function now dynamically initializes Genkit on each call.
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
      // Step 1: Retrieve relevant context from the knowledge base
      const searchResults = await vectorSearch({
        query: userMessage,
        limit: 5,
      });

      const knowledgeBaseContext = searchResults.map(r => r.text).join('\n---\n');

      // Step 2: Define the prompt for the AI model, now including the retrieved knowledge.
      const prompt = `You are a conversational AI. Your persona is defined by these traits: "${personaTraits}".
        Your primary areas of expertise are: "${conversationalTopics}".
        You are having a conversation with a user.

        IMPORTANT:
        - If the user's question is directly related to the "Knowledge Base Context" provided below, you MUST use that information to formulate your answer.
        - Base your response entirely on the provided context. Do not use external knowledge for questions related to the context.
        - If the context does not contain the answer, state that the information is not available in your knowledge base.
        - If the context is empty or irrelevant to the user's question, answer the question based on your general knowledge and persona.
        - When you use the knowledge base, do not mention the phrase "knowledge base" or "context" in your response. Just answer the question directly.

        <Knowledge Base Context>
        ${knowledgeBaseContext || "No context provided."}
        </Knowledge_Base_Context>

        Analyze the user's message and the conversation history. Based on all this information, generate a response that is helpful, relevant, and consistent with your persona.
        Your response must be a JSON object with two fields: "aiResponse" (a string) and "shouldEndConversation" (a boolean).
      `;

      try {
        // Step 3: Call the AI model with the enhanced prompt.
        const response = await ai.generate({
          model: 'googleai/gemini-1.5-flash',
          prompt: prompt,
          history: chatHistory,
          tools: [],
          output: {
            format: 'json',
            schema: GenerateChatResponseOutputSchema,
          },
          config: {
            temperature: 0.7,
          },
        });

        const output = response.output();

        if (!output || typeof output.aiResponse !== 'string') {
          console.error('[generateChatResponseFlow] Invalid or malformed output from prompt.', output);
          return {
            aiResponse: "I seem to have lost my train of thought! Could you please try sending your message again?",
            shouldEndConversation: false,
          };
        }
        
        // Add the PDF reference to the output if context was used
        if (knowledgeBaseContext && searchResults.length > 0 && searchResults[0].sourceName && searchResults[0].downloadURL) {
            output.pdfReference = {
                fileName: searchResults[0].sourceName,
                downloadURL: searchResults[0].downloadURL,
            };
        }
        
        return output;

      } catch (error: any) {
        console.error('[generateChatResponseFlow] Error calling AI model:', error);
        let userFriendlyMessage = "I'm having a bit of trouble connecting to my brain right now. Please try again in a moment.";
        
        // Add more specific error handling if you have identified common issues
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
