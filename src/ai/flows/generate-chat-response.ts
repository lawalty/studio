
'use server';
/**
 * @fileOverview A Genkit flow that generates a chat response from an AI model.
 * It uses a manually-orchestrated, retrieval-augmented generation (RAG) pipeline.
 * The AI uses recent conversational history to form a search query, searches a prioritized
 * knowledge base, and synthesizes an answer based *only* on the retrieved context.
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

// Define the flow at the top level.
const generateChatResponseFlow = ai.defineFlow(
  {
    name: 'generateChatResponseFlow',
    inputSchema: GenerateChatResponseInputSchema,
    outputSchema: GenerateChatResponseOutputSchema,
  },
  async ({ personaTraits, conversationalTopics, chatHistory, language }) => {
    
    const historyForRAG = chatHistory ? JSON.parse(JSON.stringify(chatHistory)) : [];
    const isGreeting = !historyForRAG || historyForRAG.length === 0;

    // 1. Create a contextual query from the last 4 messages (~2 turns).
    const contextualQuery = historyForRAG
      .slice(-4)
      .map((msg: any) => `${msg.role}: ${msg.parts[0].text}`)
      .join('\n');
    
    // 2. Translate the contextual query if needed for the search.
    let searchQuery = contextualQuery;
    if (language && language !== 'English' && searchQuery) {
      try {
        const { translatedText } = await translateText({ text: searchQuery, targetLanguage: 'English' });
        searchQuery = translatedText;
      } catch (e) {
        console.error("Failed to translate user query for RAG, proceeding with original text.", e);
      }
    }

    // 3. Search the knowledge base.
    const searchResults = await searchKnowledgeBase({ query: searchQuery, limit: 5 });
    
    // 4. Prepare context for the prompt.
    const retrievedContext = searchResults
      .map(r =>
        `Context from document "${r.sourceName}" (Topic: ${r.topic}, Priority: ${r.level}):
${r.text}
${(r.sourceName && r.sourceName.toLowerCase().endsWith('.pdf') && r.downloadURL) ? `(Reference URL for this chunk's source PDF: ${r.downloadURL}) (File Name: ${r.sourceName})` : ''}`
      )
      .join('\n---\n');

    // 5. Define the new system prompt based on RAG v2 requirements.
    const systemPrompt = `You are a conversational AI. Your persona is defined by these traits: "${personaTraits}".
      Your primary areas of expertise are: "${conversationalTopics}".
      Your tone should be helpful and inquisitive.

      **CRITICAL INSTRUCTIONS:**
      1.  **Respond in ${language}.** This is an absolute requirement.
      2.  **If the conversation history is empty,** your task is to provide a warm, welcoming greeting. You may reference one of your areas of expertise. Do not use the knowledge base for this initial greeting.
      3.  **If the conversation history is NOT empty,** strictly base your answers on the provided context. Do not use your general knowledge.
      4.  **If the provided context is empty or irrelevant (and it's not the start of the conversation),** you MUST state that you cannot find the information and ask the user to rephrase their question. Do not invent an answer.
      5.  Keep your answers **concise and directly related** to the user's question.
      6.  When your answer is based on information from a PDF, you MUST offer a download link.

      Your response must be a JSON object with three fields: "aiResponse" (string), "shouldEndConversation" (boolean), and an optional "pdfReference".
      - **If and only if** your response is based on a PDF document from the knowledge base, you MUST populate the "pdfReference" object with the "fileName" and "downloadURL" from the retrieved context. Otherwise, leave "pdfReference" undefined.
    `;
    
    // 6. Construct the final prompt for the LLM.
    const finalPrompt = `
      Here is the recent conversation history:
      ${historyForRAG.map((msg: any) => `${msg.role}: ${msg.parts[0].text}`).join('\n')}

      ---
      Here is the retrieved context from the knowledge base. Use this and only this to answer the user's most recent query.
      <retrieved_context>
      ${isGreeting ? 'N/A - This is the start of the conversation.' : (retrievedContext || 'No relevant information was found in the knowledge base.')}
      </retrieved_context>
      ---
    `;
    
    try {
      const response = await ai.generate({
        model: 'googleai/gemini-1.5-flash',
        system: systemPrompt,
        prompt: finalPrompt,
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
