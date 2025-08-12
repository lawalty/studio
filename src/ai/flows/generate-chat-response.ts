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
import { db as adminDb } from '@/lib/firebase-admin';
import { withRetry } from './index-document-flow';
import { getAppConfig } from '@/lib/app-config';

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
  formality: z.number().optional().default(50),
  conciseness: z.number().optional().default(50),
  tone: z.number().optional().default(50),
  formatting: z.number().optional().default(50),
});
export type GenerateChatResponseInput = z.infer<typeof GenerateChatResponseInputSchema>;

const AiResponseJsonSchema = z.object({
  aiResponse: z.string(),
  shouldEndConversation: z.boolean(),
  pdfReference: z.object({
    fileName: z.string(),
    downloadURL: z.string(),
  }).optional(),
});
export type GenerateChatResponseOutput = z.infer<typeof AiResponseJsonSchema>;

// Helper function to find the Spanish version of a document
const findSpanishPdf = async (englishSourceId: string): Promise<{ fileName: string; downloadURL: string } | null> => {
    const spanishPdfQuery = adminDb.collection('kb_spanish_pdfs_meta_v1')
        .where('linkedEnglishSourceId', '==', englishSourceId)
        .limit(1);
    
    const snapshot = await spanishPdfQuery.get();
    if (snapshot.empty) {
        return null;
    }
    const spanishDoc = snapshot.docs[0].data();
    return {
        fileName: spanishDoc.sourceName,
        downloadURL: spanishDoc.downloadURL,
    };
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
            formality: z.number(),
            conciseness: z.number(),
            tone: z.number(),
            formatting: z.number(),
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
5.  **Citations:** If, and only if, your answer is based on a document, you MUST populate the 'pdfReference' object. Use the 'source' attribute for 'fileName' and 'downloadURL' from the document tag in the context. When relevant, you can also reference the page number or section header. For example: "According to the 'Safety Policy' document on page 3, under the 'Emergency Procedures' section..."
6.  **Conversation Flow:**
    - If the user provides a greeting or engages in simple small talk, respond naturally using your persona.
    - Set 'shouldEndConversation' to true only if you explicitly say goodbye.
7.  **Response Style Equalizer (0-100 scale):**
    - **Formality ({{formality}}):** If > 70, use very formal language. If < 30, use casual language and contractions. Otherwise, use a professional, neutral style.
    - **Conciseness ({{conciseness}}):** If > 70, provide a brief summary. If < 30, provide a detailed, elaborate response. Otherwise, provide a balanced response.
    - **Tone ({{tone}}):** If > 70, be enthusiastic and upbeat. If < 30, be very neutral and direct. Otherwise, be helpful and friendly.
    - **Formatting ({{formatting}}):** If > 70 and the information is suitable, format the response as a bulleted or numbered list. If < 30, always use paragraphs. Otherwise, use your best judgment.
8.  **Output Format:** Your response MUST be a single, valid JSON object that strictly follows this schema: { "aiResponse": string, "shouldEndConversation": boolean, "pdfReference"?: { "fileName": string, "downloadURL": string } }.`,

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

// NLP Pre-processing prompt to refine the user's query for better search results.
const queryRefinementPrompt = ai.definePrompt({
    name: 'queryRefinementPrompt',
    input: { schema: z.string().describe('The raw user query.') },
    output: { schema: z.string().describe('A refined, keyword-focused query for vector search.') },
    prompt: `You are an expert at refining user questions into effective search queries for a vector database.
Analyze the user's query below. Identify the core intent and key entities.
- Do NOT answer the question.
- Do NOT add any preamble or explanation.
- Your entire output should be a concise, rephrased query containing only the essential keywords and concepts.

**User Query:**
"{{{prompt}}}"

**Refined Search Query:**
`,
});


// Define the flow at the top level.
const generateChatResponseFlow = async ({ 
    personaTraits, 
    conversationalTopics, 
    chatHistory, 
    language,
    formality = 50,
    conciseness = 50,
    tone = 50,
    formatting = 50,
}: GenerateChatResponseInput): Promise<GenerateChatResponseOutput> => {
    
    // 1. Fetch the dynamic application configuration from Firestore.
    const appConfig = await getAppConfig();

    const historyForRAG = chatHistory || [];
    const lastUserMessage = historyForRAG.length > 0 ? (historyForRAG[historyForRAG.length - 1].parts?.[0]?.text || '') : '';

    let searchQuery = lastUserMessage;
    if (!searchQuery) {
        return { aiResponse: "Hello! How can I help you today?", shouldEndConversation: false };
    }

    // 2. (Optional) Translate and refine the user's query.
    let queryForNlp = lastUserMessage;
    if (language && language.toLowerCase() !== 'english') {
      try {
        const { translatedText } = await translateText({ text: queryForNlp, targetLanguage: 'English' });
        queryForNlp = translatedText;
      } catch (e) {
        console.error("[generateChatResponseFlow] Failed to translate user query, proceeding with original text.", e);
      }
    }
    try {
        const { output } = await queryRefinementPrompt(queryForNlp, { model: 'googleai/gemini-1.5-flash' });
        searchQuery = output || queryForNlp;
    } catch (e) {
        console.error('[generateChatResponseFlow] NLP query refinement failed:', e);
        searchQuery = queryForNlp;
    }

    // 3. Search the knowledge base using the dynamic distance threshold.
    let retrievedContext = '';
    let primarySearchResult = null;
    try {
      if (searchQuery) {
        const searchResults = await searchKnowledgeBase({ 
            query: searchQuery, 
            limit: 5,
            distanceThreshold: appConfig.distanceThreshold, // Use the fetched threshold
        });
        
        if (searchResults && searchResults.length > 0) {
            primarySearchResult = searchResults[0];
            retrievedContext = searchResults
              .map(r =>
                `<document source="${r.sourceName}" sourceId="${r.sourceId}" topic="${r.topic}" priority="${r.level}" downloadURL="${r.downloadURL || ''}" pageNumber="${r.pageNumber || ''}" title="${r.title || ''}" header="${r.header || ''}">
                  <content>${r.text}</content>
                </document>`
              )
              .join('\n\n');
        }
      }
    } catch (e: any) {
      console.error('[generateChatResponseFlow] Knowledge base search failed:', e);
      retrievedContext = `CONTEXT_SEARCH_FAILED: ${e.message}`;
    }
    
    if (searchQuery && !retrievedContext) {
      retrievedContext = 'NO_CONTEXT_FOUND';
    }

    // 4. Construct the prompt and generate the final AI response.
    const promptInput = {
        personaTraits,
        conversationalTopics,
        language: language || 'English',
        chatHistory: `<history>${historyForRAG.map((msg: any) => `${msg.role}: ${msg.parts?.[0]?.text || ''}`).join('\n')}</history>`,
        retrievedContext: retrievedContext || 'NO_CONTEXT_FOUND',
        formality,
        conciseness,
        tone,
        formatting,
    };
    
    try {
      const { output } = await withRetry(() => chatPrompt(promptInput, { model: 'googleai/gemini-1.5-flash' }));
      if (!output) {
        throw new Error('AI model returned an empty or invalid response.');
      }
      
      if (output.pdfReference && language === 'Spanish' && primarySearchResult?.sourceId) {
          const spanishPdf = await findSpanishPdf(primarySearchResult.sourceId);
          if (spanishPdf) {
              output.pdfReference = spanishPdf;
          }
      }
      
      return output;

    } catch (error: any)
{
      console.error('[generateChatResponseFlow] Error generating AI response:', error);
      return {
        aiResponse: `DEBUG: An error occurred. Details: ${error.message || 'Unknown'}`,
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
