
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

const FIRESTORE_CONFIG_PATH = "configurations/app_config";

// Helper to fetch the application configuration, including the dynamic RAG tuning setting.
const getAppConfig = async (): Promise<{ distanceThreshold: number }> => {
    try {
        const docRef = adminDb.doc(FIRESTORE_CONFIG_PATH);
        const docSnap = await docRef.get();
        if (docSnap.exists()) {
            const data = docSnap.data();
            return {
                distanceThreshold: typeof data?.distanceThreshold === 'number' ? data.distanceThreshold : 0.4,
            };
        }
        // Return default if no config is found
        return { distanceThreshold: 0.4 };
    } catch (error) {
        console.error("[getAppConfig] Error fetching config, using default. Error:", error);
        return { distanceThreshold: 0.4 };
    }
};


// Helper function to find the Spanish version of a document
const findSpanishPdf = async (englishSourceId: string): Promise<{ fileName: string; downloadURL: string } | null> => {
    // ... Omitted for brevity
};

// Define the prompt using the stable ai.definePrompt pattern
const chatPrompt = ai.definePrompt({
    // ... Omitted for brevity
});

// NLP Pre-processing prompt to refine the user's query for better search results.
const queryRefinementPrompt = ai.definePrompt({
    // ... Omitted for brevity
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
    // ... Translation logic omitted for brevity ...
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
              .join('

');
        }
      }
    } catch (e) {
      console.error('[generateChatResponseFlow] Knowledge base search failed:', e);
      retrievedContext = 'CONTEXT_SEARCH_FAILED';
    }
    
    if (searchQuery && !retrievedContext) {
      retrievedContext = 'NO_CONTEXT_FOUND';
    }

    // 4. Construct the prompt and generate the final AI response.
    const promptInput = {
        personaTraits,
        conversationalTopics,
        language: language || 'English',
        chatHistory: `<history>${historyForRAG.map((msg: any) => `${msg.role}: ${msg.parts?.[0]?.text || ''}`).join('
')}</history>`,
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
      
      // ... Spanish PDF logic omitted for brevity ...
      
      return output;

    } catch (error: any) {
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
