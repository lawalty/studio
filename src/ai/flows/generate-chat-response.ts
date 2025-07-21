
'use server';
/**
 * @fileOverview A Genkit flow that generates a chat response from an AI model.
 * It uses a retrieval-augmented generation (RAG) pipeline. The AI is
 * strictly instructed to use information from a knowledge base to answer
 * questions and only use its persona for conversational filler.
 */
import { z } from 'zod';
import { searchKnowledgeBase } from '@/ai/retrieval/vector-search';
import { translateText } from './translate-text-flow';
import { ai } from '@/ai/genkit';
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

// This is the schema for the *stringified JSON object* we expect from the model.
const AiResponseJsonSchema = z.object({
  aiResponse: z.string().describe("The AI's generated response."),
  shouldEndConversation: z.boolean().describe('Indicates whether the conversation should end based on the AI response.'),
  pdfReference: z.object({
    fileName: z.string(),
    downloadURL: z.string(),
  }).optional().describe('A reference to a PDF document if the AI response is based on one.'),
});
// This is the final output schema for the flow.
export const GenerateChatResponseOutputSchema = AiResponseJsonSchema;
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

// Define the prompt using the stable ai.definePrompt pattern
const chatPrompt = ai.definePrompt({
    name: 'chatRAGPrompt',
    input: {
        schema: z.object({
            personaTraits: z.string(),
            conversationalTopics: z.string(),
            language: z.string(),
            chatHistory: z.string(),
            retrievedContext: z.string(),
        })
    },
    // The prompt now expects a string, which should be a stringified JSON object.
    output: {
        format: 'text',
    },
    system: `You are a helpful and professional conversational AI.
Your persona is defined by these traits: "{{personaTraits}}".
You are an expert in: "{{conversationalTopics}}".

Your primary goal is to answer user questions based on retrieved documents.

**CRITICAL INSTRUCTIONS:**
1.  **Strictly Adhere to Provided Context:** You MUST answer the user's question based *only* on the information inside the <retrieved_context> XML tags. Do not use your general knowledge unless the context is empty or irrelevant.
2.  **Handle "No Context":** If the context is 'NO_CONTEXT_FOUND' or 'CONTEXT_SEARCH_FAILED', you MUST inform the user that you could not find any relevant information in your knowledge base. DO NOT try to answer the question from your own knowledge.
3.  **Language:** You MUST respond in {{language}}. All of your output, including chit-chat and error messages, must be in this language.
4.  **Citations:** If, and only if, your answer is based on information from a document, you MUST populate the 'pdfReference' object. Use the 'source' for 'fileName' and 'downloadURL' from the document tag in the context.
5.  **Conversation Flow:**
    - If the user provides a greeting or engages in simple small talk, respond naturally according to your persona.
    - Set 'shouldEndConversation' to true only if you explicitly say goodbye.
6.  **Output Format:** Your response MUST be a single, valid JSON object as a string, without any wrapping characters like \`\`\`json. The JSON object must strictly follow this schema: { "aiResponse": string, "shouldEndConversation": boolean, "pdfReference"?: { "fileName": string, "downloadURL": string } }.`,

    prompt: `The user is conversing in {{language}}.
Here is the full conversation history:
<history>
{{{chatHistory}}}
</history>

Here is the context retrieved from the knowledge base to answer the user's latest message.
<retrieved_context>
{{{retrievedContext}}}
</retrieved_context>
`
});


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
    let primarySearchResult = null;
    try {
      if (searchQuery) {
        const searchResults = await searchKnowledgeBase({ query: searchQuery, limit: 5 });
        
        if (searchResults && searchResults.length > 0) {
            primarySearchResult = searchResults[0];
            retrievedContext = searchResults
              .map(r =>
                `<document source="${r.sourceName}" sourceId="${r.sourceId}" topic="${r.topic}" priority="${r.level}" downloadURL="${r.downloadURL || ''}">\n  <content>\n    ${r.text}\n  </content>\n</document>`
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

    // 4. Construct the prompt for the LLM.
    const promptInput = {
        personaTraits,
        conversationalTopics,
        language: language || 'English',
        chatHistory: historyForRAG.map((msg: any) => `${msg.role}: ${msg.parts[0].text}`).join('\n'),
        retrievedContext: retrievedContext || 'NO_CONTEXT_FOUND'
    };
    
    try {
      const response = await chatPrompt(promptInput, { model: 'googleai/gemini-1.5-flash' });
      const rawTextOutput = response.text;

      if (!rawTextOutput) {
        throw new Error('The AI model returned an empty response. This may be due to a safety filter or an internal model error.');
      }
      
      // The output from the model is a string, which we need to parse into a JSON object.
      let output: GenerateChatResponseOutput;
      try {
        output = JSON.parse(rawTextOutput);
      } catch (jsonError) {
        console.error('[generateChatResponseFlow] Failed to parse JSON from AI response. Raw text:', rawTextOutput, 'Error:', jsonError);
        throw new Error('The AI model returned a malformed, non-JSON response. Please check the prompt instructions.');
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

      // Re-throw the error with a user-friendly message so the client-side can catch it.
      // This is better than returning a successful response with an error message inside it.
      // However, for robustness, we will return a structured error response.
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

    