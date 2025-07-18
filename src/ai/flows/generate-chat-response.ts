
'use server';
/**
 * @fileOverview A Genkit flow that generates a chat response from an AI model.
 * It uses a retrieval-augmented generation (RAG) pipeline. The AI is
 * strictly instructed to use information from a knowledge base to answer
 * questions and only use its persona for conversational filler.
 */
import { z } from 'zod';
import { searchKnowledgeBase } from '../retrieval/vector-search';
import { translateText } from './translate-text-flow';
import { ai } from '@/ai/genkit'; // Ensures Genkit is configured
import { db } from '@/lib/firebase-admin';

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

// Helper function to find the Spanish version of a document
const findSpanishPdf = async (englishSourceId: string): Promise<{ fileName: string; downloadURL: string } | null> => {
    try {
        const spanishPdfQuery = db.collection('kb_spanish_pdfs_meta_v1')
            .where('linkedEnglishSourceId', '==', englishSourceId)
            .limit(1);
        
        const snapshot = await spanishPdfQuery.get();

        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const data = doc.data();
            if (data.downloadURL && data.sourceName) {
                return {
                    fileName: data.sourceName,
                    downloadURL: data.downloadURL,
                };
            }
        }
        return null;
    } catch (error) {
        console.error(`[findSpanishPdf] Error searching for Spanish version of ${englishSourceId}:`, error);
        return null;
    }
};

// Define the flow at the top level.
const generateChatResponseFlow = async ({ personaTraits, conversationalTopics, chatHistory, language }: GenerateChatResponseInput): Promise<GenerateChatResponseOutput> => {
    
    const historyForRAG = JSON.parse(JSON.stringify(chatHistory || []));
    const lastUserMessage = historyForRAG.length > 0 ? historyForRAG[historyForRAG.length - 1].parts[0].text : '';

    // 1. Translate the user's query if needed for the search.
    let searchQuery = lastUserMessage;
    if (language && language.toLowerCase() !== 'english' && searchQuery) {
      try {
        const { translatedText } = await translateText({ text: searchQuery, targetLanguage: 'English' });
        searchQuery = translatedText;
      } catch (e) {
        console.error("[generateChatResponseFlow] Failed to translate user query for RAG, proceeding with original text.", e);
      }
    }

    // 2. Search the knowledge base.
    let retrievedContext = '';
    let primarySearchResult = null; // Store the first search result to check for a Spanish version
    try {
      if (searchQuery) { // Only search if there's something to search for.
        const searchResults = await searchKnowledgeBase({ query: searchQuery, limit: 5 });
        
        if (searchResults && searchResults.length > 0) {
            primarySearchResult = searchResults[0];
            retrievedContext = searchResults
              .map(r =>
                `<document source="${r.sourceName}" sourceId="${r.sourceId}" topic="${r.topic}" priority="${r.level}" downloadURL="${r.downloadURL || ''}">
  <content>
    ${r.text}
  </content>
</document>`
              )
              .join('\n\n');
        }
      }
    } catch (e) {
      console.error('[generateChatResponseFlow] Knowledge base search failed:', e);
      retrievedContext = 'CONTEXT_SEARCH_FAILED';
    }
    
    if (searchQuery && !retrievedContext) {
      retrievedContext = 'NO_CONTEXT_FOUND';
    }

    // 3. Define the new, more direct system prompt.
    const systemPrompt = `You are a helpful and professional conversational AI.
Your persona is defined by these traits: "${personaTraits}".
You are an expert in: "${conversationalTopics}".

Your primary goal is to answer user questions based on retrieved documents.

**CRITICAL INSTRUCTIONS:**
1.  **Strictly Adhere to Provided Context:** You MUST answer the user's question based *only* on the information inside the <retrieved_context> XML tags. Do not use your general knowledge unless the context is empty or irrelevant.
2.  **Handle "No Context":** If the context is 'NO_CONTEXT_FOUND' or 'CONTEXT_SEARCH_FAILED', you MUST inform the user that you could not find any relevant information in your knowledge base. DO NOT try to answer the question from your own knowledge.
3.  **Language:** You MUST respond in ${language}. All of your output, including chit-chat and error messages, must be in this language.
4.  **Citations:** If, and only if, your answer is based on information from a document, you MUST populate the 'pdfReference' object. Use the 'source' for 'fileName' and 'downloadURL' from the document tag in the context.
5.  **Conversation Flow:**
    - If the user provides a greeting or engages in simple small talk, respond naturally according to your persona.
    - Set 'shouldEndConversation' to true only if you explicitly say goodbye.
6.  **Output Format:** Your response MUST be a valid JSON object that strictly follows this schema: { "aiResponse": string, "shouldEndConversation": boolean, "pdfReference"?: { "fileName": string, "downloadURL": string } }.
`;
    
    // 4. Construct the final prompt for the LLM.
    const finalPrompt = `The user is conversing in ${language}.
Here is the full conversation history:
<history>
${historyForRAG.map((msg: any) => `${msg.role}: ${msg.parts[0].text}`).join('\n')}
</history>

Here is the context retrieved from the knowledge base to answer the user's latest message.
<retrieved_context>
${retrievedContext || 'NO_CONTEXT_FOUND'}
</retrieved_context>
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
          temperature: 0.2,
        },
      });

      let output = response.output;

      if (!output || typeof output.aiResponse !== 'string') {
        throw new Error('Malformed AI output.');
      }

      // Check for Spanish PDF override
      if (output.pdfReference && language === 'Spanish' && primarySearchResult?.sourceId) {
          const spanishPdf = await findSpanishPdf(primarySearchResult.sourceId);
          if (spanishPdf) {
              output.pdfReference = spanishPdf; // Override with the Spanish version
          }
      }
      
      return output;

    } catch (error: any) {
      console.error('[generateChatResponseFlow] Error generating AI response:', error);
      let userFriendlyMessage = "I'm sorry, but I encountered an unexpected error. Please try again in a moment.";
      
      if (language && language.toLowerCase() !== 'english') {
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
  };

// Export a wrapper function that calls the flow.
export async function generateChatResponse(
  input: GenerateChatResponseInput
): Promise<GenerateChatResponseOutput> {
  return generateChatResponseFlow(input);
}
