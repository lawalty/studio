
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
  personalBio: z.string().describe("The AI's personal history and backstory."),
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

const AiResponseJsonSchema = z.object({
  aiResponse: z.string(),
  isClarificationQuestion: z.boolean().describe('Set to true if you are asking the user a question to clarify their request.'),
  shouldEndConversation: z.boolean(),
  pdfReference: z.object({
    fileName: z.string(),
    downloadURL: z.string(),
  }).optional(),
  distanceThreshold: z.number().optional(),
  // Add style values to the output for diagnostics
  formality: z.number().optional(),
  conciseness: z.number().optional(),
  tone: z.number().optional(),
  formatting: z.number().optional(),
});
export type GenerateChatResponseOutput = z.infer<typeof AiResponseJsonSchema>;

// Helper function to find the Spanish version of a document
const findSpanishPdf = async (englishSourceId: string): Promise<{ fileName: string; downloadURL: string } | null> => {
    const spanishPdfQuery = adminDb.collection('kb_meta')
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
            personalBio: z.string(),
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
    system: `You are a helpful conversational AI.
Your persona is: "{{personaTraits}}".
Your personal bio/history is: "{{personalBio}}".

Your first and most important task is to analyze the 'Response Style Equalizer' values. You MUST then generate a response that strictly adheres to ALL of these style rules.

**CRITICAL INSTRUCTIONS:**
1.  **Adopt Persona & Bio**: When the user asks "you" a question (e.g., "When did you join?" or "Tell me about yourself"), you MUST answer from your own perspective, using your defined persona and personal bio. Use "I" to refer to yourself.
2.  **Use Your Memories for Other Questions**: For all other questions NOT about yourself, you MUST answer based *only* on the information inside the <retrieved_context> XML tags, which represent your memories. Do not use your general knowledge.
3.  **Handle "No Memory":** If the context is 'NO_CONTEXT_FOUND' or 'CONTEXT_SEARCH_FAILED', you MUST inform the user that you could not recall any relevant information. DO NOT try to answer the question from your own knowledge. Use your defined persona for this response.
4.  **Clarifying Question Policy**: If the user's question is broad or vague (e.g., 'Tell me about X'), you MUST first provide a brief, one-sentence summary and then immediately ask a clarifying question to narrow down what the user is interested in (e.g., 'What specifically would you like to know about X?'). Set 'isClarificationQuestion' to true.
5.  **Language:** You MUST respond in {{language}}. All of your output, including chit-chat and error messages, must be in this language.
6.  **Citations:** If, and only if, you believe offering the source file would be helpful to the user, you MUST populate the 'pdfReference' object. Use the 'source' attribute for 'fileName' and 'downloadURL' from the document tag in the context.
7.  **Conversation Flow:**
    - If the user provides a greeting or engages in simple small talk, respond naturally using your persona.
    - Set 'shouldEndConversation' to true only if you explicitly say goodbye.
8.  **Response Style Equalizer (0-100 scale) - YOU MUST FOLLOW THESE RULES:**
    - **Formality ({{formality}}):**
        - If > 70: You MUST use extremely formal language, address the user with a title (e.g., "Sir" or "Ma'am"), and avoid all contractions (e.g., use "do not" instead of "don't").
        - If < 30: You MUST use very casual language, include slang appropriate for a friendly assistant (e.g., "No problem!", "Got it!"), and use contractions.
        - Otherwise (30-70): You MUST use a standard, professional, and friendly style.
    - **Conciseness ({{conciseness}}):**
        - If > 70: Your response MUST be a single, direct sentence. No exceptions.
        - If < 30: Your response MUST be highly detailed, elaborate, and consist of at least three full paragraphs.
        - Otherwise (30-70): You MUST provide a balanced, standard-length response of one or two paragraphs.
    - **Tone ({{tone}}):**
        - If > 70: You MUST be very enthusiastic and upbeat. Use positive adjectives and exclamation points.
        - If < 30: You MUST adopt a strictly neutral, direct, and objective tone. Do not use any emotive language, exclamation points, or conversational filler. Your response should be like a technical document.
        - Otherwise (30-70): You MUST maintain a helpful and friendly, but not overly-enthusiastic, tone.
    - **Formatting ({{formatting}}):**
        - If > 70: If the information is suitable, you MUST format the response as a bulleted or numbered list.
        - If < 30: You are FORBIDDEN from using lists. You MUST always format your response as full paragraphs.
        - Otherwise (30-70): You should use your best judgment on whether to use lists or paragraphs.
9.  **Output Format:** Your response MUST be a single, valid JSON object that strictly follows this schema: { "aiResponse": string, "isClarificationQuestion": boolean, "shouldEndConversation": boolean, "pdfReference"?: { "fileName": string, "downloadURL": string } }.`,

    prompt: `You are an expert in: "{{conversationalTopics}}".
The user is conversing in {{language}}.
Here is the full conversation history:
{{{chatHistory}}}

Here is the context retrieved from your memories to answer the user's latest message.
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
    personalBio,
    conversationalTopics, 
    chatHistory, 
    language,
}: GenerateChatResponseInput): Promise<GenerateChatResponseOutput> => {
    
    // 1. Fetch the dynamic application configuration from Firestore.
    const appConfig = await getAppConfig();

    const historyForRAG = chatHistory || [];
    const lastUserMessage = historyForRAG.length > 0 ? (historyForRAG[historyForRAG.length - 1].parts?.[0]?.text || '') : '';

    let searchQuery = lastUserMessage;
    if (!searchQuery) {
        return { aiResponse: "Hello! How can I help you today?", isClarificationQuestion: false, shouldEndConversation: false };
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
                `<document source="${r.sourceName}" sourceId="${r.sourceId}" topic="${r.topic}" priority="${r.level}" downloadURL="${r.downloadURL || ''}" pageNumber="${r.pageNumber || ''}" title="${r.title || ''}" header="${r.header || ''}" distance="${r.distance.toFixed(4)}">
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
        personalBio,
        conversationalTopics,
        language: language || 'English',
        chatHistory: `<history>${historyForRAG.map((msg: any) => `${msg.role}: ${msg.parts?.[0]?.text || ''}`).join('\n')}</history>`,
        retrievedContext: retrievedContext || 'NO_CONTEXT_FOUND',
        formality: appConfig.formality,
        conciseness: appConfig.conciseness,
        tone: appConfig.tone,
        formatting: appConfig.formatting,
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
      
      // Add the used distance threshold and style values to the output for debugging/display
      output.distanceThreshold = appConfig.distanceThreshold;
      output.formality = appConfig.formality;
      output.conciseness = appConfig.conciseness;
      output.tone = appConfig.tone;
      output.formatting = appConfig.formatting;

      return output;

    } catch (error: any)
{
      console.error('[generateChatResponseFlow] Error generating AI response:', error);
      return {
        aiResponse: `DEBUG: An error occurred. Details: ${error.message || 'Unknown'}`,
        isClarificationQuestion: false,
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

    