
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
import { withRetry } from './index-document-flow';

// Zod schema for the input of the generateChatResponse flow.
const GenerateChatResponseInputSchema = z.object({
  personaTraits: z.string().describe("A description of the AI's personality and character traits."),
  conversationalTopics: z.string().describe("A comma-separated list of topics the AI is an expert in."),
  language: z.string().optional().default('English').describe('The language the user is speaking in and expects a response in.'),
  chatHistory: z.array(z.object({
    role: z.enum(['user', 'model']),
    parts: z.array(z.object({
      text: z.string(),
    })),
  })).optional().describe('The history of the conversation so far, including the latest user message.'),
});
type GenerateChatResponseInput = z.infer<typeof GenerateChatResponseInputSchema>;

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
export type GenerateChatResponseOutput = z.infer<typeof AiResponseJsonSchema>;


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
    output: {
        format: 'json',
        schema: AiResponseJsonSchema,
    },
    system: `You are a helpful conversational AI. Your persona is: "{{personaTraits}}". Your primary goal is to answer user questions based on the retrieved documents about specific people or topics.

**CRITICAL INSTRUCTIONS:**
1.  **Adopt Persona from Context**: When the user asks "you" a question (e.g., "When did you join?"), you MUST answer from the perspective of the person or entity described in the <retrieved_context>, as if you are them. Use "I" to refer to that person. For example, if the context says "He joined in 1989," your answer must be "I joined in 1989."
2.  **Strictly Adhere to Provided Context**: You MUST answer the user's question based *only* on the information inside the <retrieved_context> XML tags. Do not use your general knowledge.
3.  **Handle "No Context":** If the context is 'NO_CONTEXT_FOUND' or 'CONTEXT_SEARCH_FAILED', you MUST inform the user that you could not find any relevant information in your knowledge base. DO NOT try to answer the question from your own knowledge. Use your defined persona for this response.
4.  **Language:** You MUST respond in {{language}}. All of your output, including chit-chat and error messages, must be in this language.
5.  **Citations:** If, and only if, your answer is based on a document, you MUST populate the 'pdfReference' object. Use the 'source' attribute for 'fileName' and 'downloadURL' from the document tag in the context.
6.  **Conversation Flow:**
    - If the user provides a greeting or engages in simple small talk, respond naturally using your persona.
    - Set 'shouldEndConversation' to true only if you explicitly say goodbye.
7.  **Output Format:** Your response MUST be a single, valid JSON object that strictly follows this schema: { "aiResponse": string, "shouldEndConversation": boolean, "pdfReference"?: { "fileName": string, "downloadURL": string } }.`,

    prompt: `You are an expert in: "{{conversationalTopics}}".
The user is conversing in {{language}}.
Here is the full conversation history:
{{{chatHistory}}}

Here is the context retrieved from the knowledge base to answer the user's latest message.
<retrieved_context>
{{{retrievedContext}}}
</retrieved_context>
`
});

// Function to pre-process text for better embedding and search quality.
const preprocessText = (text: string): string => {
  if (!text) return '';
  return text.toLowerCase();
};


// Define the flow at the top level.
const generateChatResponseFlow = async ({ personaTraits, conversationalTopics, chatHistory, language }: GenerateChatResponseInput): Promise<GenerateChatResponseOutput> => {
    
    const historyForRAG = chatHistory || [];
    const lastUserMessage = historyForRAG.length > 0 ? (historyForRAG[historyForRAG.length - 1].parts?.[0]?.text || '') : '';

    // 1. Translate the user's query if needed for the search and preprocess it.
    let searchQuery = lastUserMessage;
    if (searchQuery) {
        if (language && language.toLowerCase() !== 'english') {
          try {
            const { translatedText } = await translateText({ text: searchQuery, targetLanguage: 'English' });
            searchQuery = translatedText;
          } catch (e) {
            console.error("[generateChatResponseFlow] Failed to translate user query for RAG, proceeding with original text.", e);
          }
        }
        searchQuery = preprocessText(searchQuery);
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

    // 4. Construct the prompt for the LLM.
    const promptInput = {
        personaTraits,
        conversationalTopics,
        language: language || 'English',
        chatHistory: `<history>
${historyForRAG.map((msg: any) => `${msg.role}: ${msg.parts?.[0]?.text || ''}`).join('\n')}
</history>`,
        retrievedContext: retrievedContext || 'NO_CONTEXT_FOUND'
    };
    
    try {
      const { output } = await withRetry(() => chatPrompt(promptInput, { model: 'googleai/gemini-1.5-flash' }));

      if (!output) {
        throw new Error('AI model returned an empty or invalid response after multiple retries.');
      }
      
      if (output.pdfReference && language === 'Spanish' && primarySearchResult?.sourceId) {
          const spanishPdf = await findSpanishPdf(primarySearchResult.sourceId);
          if (spanishPdf) {
              output.pdfReference = spanishPdf;
          }
      }
      
      return output;

    } catch (error: any) {
      console.error('[generateChatResponseFlow] Error generating AI response:', error);
      return {
        aiResponse: `DEBUG: An error occurred in the AI flow. Technical details: ${error.message || 'Unknown error'}`,
        shouldEndConversation: true,
      };
    }
  };

// Export a wrapper function that calls the flow.
export async function generateChatResponse(
  input: GenerateChatResponseInput
): Promise<GenerateChatResponseOutput> {
  return generateChatResponseFlow(input);
}
