
'use server';
/**
 * @fileOverview A Genkit flow that generates a chat response from an AI model.
 * It uses a tool-based, retrieval-augmented generation (RAG) approach. The AI can
 * decide when to search the knowledge base to answer a user's question.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { searchKnowledgeBase } from '../retrieval/vector-search';
import { defineTool } from '@genkit-ai/ai/tool';

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

// Define the knowledge base search tool at the top level.
const knowledgeBaseSearchTool = defineTool(
  {
    name: 'knowledgeBaseSearch',
    description: 'Searches the knowledge base for information to answer user questions about specific topics.',
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({ results: z.array(z.any()) }), // Using z.any() for flexibility
  },
  async ({ query }) => {
      // Use the correctly named 'searchKnowledgeBase' function.
      return await searchKnowledgeBase({ query, limit: 5 });
  }
);

// Define the flow at the top level.
const generateChatResponseFlow = ai.defineFlow(
  {
    name: 'generateChatResponseFlow',
    inputSchema: GenerateChatResponseInputSchema,
    outputSchema: GenerateChatResponseOutputSchema,
  },
  async ({ userMessage, personaTraits, conversationalTopics, chatHistory }) => {
    
    const prompt = `You are a conversational AI. Your persona is defined by these traits: "${personaTraits}".
      Your primary areas of expertise are: "${conversationalTopics}".
      You are having a conversation with a user.

      IMPORTANT:
      - You have a tool named "knowledgeBaseSearch" to find specific information.
      - Use this tool ONLY when the user asks a direct question that requires looking up data or procedures.
      - For general conversation, greetings, or questions outside your expertise, DO NOT use the tool. Just respond naturally.
      - If you use the tool and find relevant information, state the answer and mention the source document (e.g., "According to the document 'source.pdf', the answer is...").
      - If the tool returns no relevant information, state that you couldn't find an answer in the knowledge base.

      Your response must be a JSON object with two fields: "aiResponse" (a string) and "shouldEndConversation" (a boolean).
    `;

    try {
      const response = await ai.generate({
        model: 'googleai/gemini-1.5-flash',
        prompt: prompt,
        history: chatHistory,
        tools: [knowledgeBaseSearchTool],
        output: {
          format: 'json',
          schema: GenerateChatResponseOutputSchema,
        },
        config: {
          temperature: 0.3, 
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
      
      // This logic can be expanded later if we want to extract the PDF reference from the tool's output.
      // For now, the AI will cite the source directly in its text response.
      
      return output;

    } catch (error: any) {
      console.error('[generateChatResponseFlow] Error calling AI model:', error);
      let userFriendlyMessage = "Sorry, I encountered an error. Please try again.";
      
      if (error.message && (error.message.includes('tool_code') || error.message.includes('tool calling'))) {
        userFriendlyMessage = "I'm having a little trouble using my knowledge base right now. Please try that again in a moment.";
      } else if (error.message && error.message.includes('API key') || error.message.includes('permission')) {
        userFriendlyMessage = "It looks like I don't have the right permissions to access some information. This is a configuration issue.";
      }

      return {
        aiResponse: userFriendlyMessage,
        shouldEndConversation: false,
      };
    }
  }
);

// Export a wrapper function that calls the flow.
export async function generateChatResponse(
  input: GenerateChatResponseInput
): Promise<GenerateChatResponseOutput> {
  return generateChatResponseFlow(input);
}
