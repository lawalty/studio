
'use server';
/**
 * @fileOverview A Genkit flow that generates a chat response from an AI model.
 * It uses a tool-based, retrieval-augmented generation (RAG) approach. The AI can
 * decide when to search the knowledge base to answer a user's question. It supports
 * multi-language conversations by translating user queries for RAG and responding in the user's language.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { searchKnowledgeBase } from '../retrieval/vector-search';
import { translateText } from './translate-text-flow';

// Zod schema for the input of the generateChatResponse flow.
export const GenerateChatResponseInputSchema = z.object({
  personaTraits: z.string().describe("A summary of the AI's personality and character traits."),
  conversationalTopics: z.string().describe("A comma-separated list of topics the AI is an expert in."),
  language: z.string().optional().default('English').describe('The language the user is speaking in and expects a response in.'),
  chatHistory: z.array(z.object({
    role: z.enum(['user', 'model']),
    parts: z.array(z.object({
      text: z.string(),
    })),
  })).optional().describe('The history of the conversation so far, including the latest user message.'),
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
const knowledgeBaseSearchTool = ai.defineTool(
  {
    name: 'knowledgeBaseSearch',
    description: 'Searches the knowledge base for information to answer user questions about specific topics.',
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({ results: z.array(z.any()) }), // Using z.any() for flexibility
  },
  async ({ query }) => {
    // Use the correctly named 'searchKnowledgeBase' function and wrap the result.
    const searchResults = await searchKnowledgeBase({ query, limit: 5 });
    return { results: searchResults };
  }
);

// Define the flow at the top level.
const generateChatResponseFlow = ai.defineFlow(
  {
    name: 'generateChatResponseFlow',
    inputSchema: GenerateChatResponseInputSchema,
    outputSchema: GenerateChatResponseOutputSchema,
  },
  async ({ personaTraits, conversationalTopics, chatHistory, language }) => {
    
    // For RAG to work against an English knowledge base, we must search using an English query.
    // We will translate the user's message to English for the search,
    // but instruct the AI to respond in the user's original language.
    const historyForRAG = chatHistory ? JSON.parse(JSON.stringify(chatHistory)) : []; // Deep copy to avoid mutation
    const lastMessage = historyForRAG.length > 0 ? historyForRAG[historyForRAG.length - 1] : null;

    if (language && language !== 'English' && lastMessage && lastMessage.role === 'user') {
      try {
        const originalText = lastMessage.parts[0].text;
        const { translatedText } = await translateText({ text: originalText, targetLanguage: 'English' });
        // Modify the last message in our copied history to use the English translation for the RAG step.
        lastMessage.parts[0].text = translatedText;
      } catch (e) {
        console.error("Failed to translate user message for RAG, proceeding with original text.", e);
        // If translation fails, we still proceed, though RAG may be less effective.
      }
    }
    
    const systemPrompt = `You are a conversational AI. Your persona is defined by these traits: "${personaTraits}".
      Your primary areas of expertise are: "${conversationalTopics}".
      You are having a conversation with a user.

      **IMPORTANT INSTRUCTIONS:**
      - **Respond in ${language}.** This is critical.
      - You have a tool named "knowledgeBaseSearch" to find specific information.
      - Use this tool ONLY when the user asks a direct question that requires looking up data or procedures.
      - For general conversation, greetings, or questions outside your expertise, DO NOT use the tool. Just respond naturally.
      - If you use the tool and find relevant information from a source, state the answer and mention the source document.
      - If the tool returns no relevant information, state that you couldn't find an answer in the knowledge base.

      Your response must be a JSON object with three fields: "aiResponse" (a string), "shouldEndConversation" (a boolean), and an optional "pdfReference".
      - **If and only if** your response is based on a PDF document from the knowledge base, you MUST populate the "pdfReference" object with the "fileName" and "downloadURL" provided in the tool's search result for that document. Otherwise, leave "pdfReference" undefined.
    `;

    try {
      const response = await ai.generate({
        model: 'googleai/gemini-1.5-flash',
        system: systemPrompt,
        // The history sent to the LLM contains the (potentially translated) last user message.
        prompt: historyForRAG,
        tools: [knowledgeBaseSearchTool],
        output: {
          format: 'json',
          schema: GenerateChatResponseOutputSchema,
        },
        config: {
          temperature: 0.3, 
        },
      });

      const output = response.output;

      if (!output || typeof output.aiResponse !== 'string') {
        console.error('[generateChatResponseFlow] Invalid or malformed output from prompt.', output);
        return {
          aiResponse: "I seem to have lost my train of thought! Could you please try sending your message again?",
          shouldEndConversation: false,
        };
      }
      
      return output;

    } catch (error: any) {
      console.error('[generateChatResponseFlow] Error calling AI model:', error);
      let userFriendlyMessage = "Sorry, I encountered an error. Please try again.";
      
      if (error.message && (error.message.includes('tool_code') || error.message.includes('tool calling'))) {
        userFriendlyMessage = "I'm having a little trouble using my knowledge base right now. Please try that again in a moment.";
      } else if (error.message && (error.message.includes('API key') || error.message.includes('permission'))) {
        userFriendlyMessage = "It looks like I don't have the right permissions to access some information. This is a configuration issue.";
      }
      
      // If the user's language is not English, translate the error message.
      if (language && language !== 'English') {
        try {
          userFriendlyMessage = (await translateText({ text: userFriendlyMessage, targetLanguage: language })).translatedText;
        } catch (e) {
            // Ignore translation error for the error message itself.
        }
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
