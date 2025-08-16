
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
import { db as adminDb, admin } from '@/lib/firebase-admin';
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
  clarificationAttemptCount: z.number().optional().default(0).describe('The number of consecutive times the AI has had to ask for clarification.'),
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
  distance: z.number().optional().describe('The cosine distance of the most relevant search result.'),
  distanceThreshold: z.number().optional().describe('The distance threshold used for this search query.'),
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
            clarificationAttemptCount: z.number(),
        })
    },
    output: {
        format: 'json',
        schema: AiResponseJsonSchema,
    },
    prompt: `You are a helpful conversational AI. Your persona is: "{{personaTraits}}". Your personal bio/history is: "{{personalBio}}". Your first and most important task is to analyze the 'Response Style Equalizer' values. You MUST then generate a response that strictly adheres to ALL of these style rules.

**CRITICAL INSTRUCTIONS:**
1.  **Clarification Limit**: The 'clarificationAttemptCount' is {{clarificationAttemptCount}}. If this count is 2 or greater, you are FORBIDDEN from asking another clarifying question. You MUST provide a direct answer using the best available information, even if the context is weak or empty. Set 'isClarificationQuestion' to 'false'.
2.  **Ending the Conversation**: If the user's last message is a simple negative response (e.g., 'No', 'Nope', 'That's all') in response to your question "Is there anything else I can help with?", you MUST interpret this as the end of the conversation. Respond with a polite closing remark (e.g., "Alright. Have a great day!") and set 'shouldEndConversation' to 'true'.
3.  **Adopt Persona & Bio**: When the user asks "you" a question (e.g., "When did you join?" or "Tell me about yourself"), you MUST answer from your own perspective, using your defined persona and personal bio. Use "I" to refer to yourself. Do not ask for clarification for these types of questions.
4.  **Knowledge Base vs. General Knowledge**:
    - If the retrieved context inside <retrieved_context> is NOT empty, you MUST use it as your primary source of truth. Synthesize the information from the context into a natural, conversational response that matches your persona. Do not simply copy the text.
    - If the retrieved context IS empty ('NO_CONTEXT_FOUND'), but the user's question is a common-sense workplace or business scenario (e.g., how to handle an employee issue, general advice), you MUST use your general knowledge to provide a helpful, practical response.
    - If the context is empty and the question is not a common-sense scenario, proceed to the Clarification step.
5.  **Recalling Chat History**: If the retrieved context contains a document with the attribute 'priority="Chat History"', you MUST begin your response with a phrase that indicates you are recalling a past conversation, such as "I remember we discussed..." or "In a previous conversation...". This is mandatory when using information from a chat history document.
6.  **Clarification Gate Logic - Two Scenarios**: (Unless forbidden by the Clarification Limit)
    a.  **Low-Confidence / No Context**: If the retrieved context is empty ('NO_CONTEXT_FOUND'), and the user's question is not a general common-sense query you can answer, do NOT try to answer. Instead, you MUST ask a single, targeted clarifying question to help you understand what to search for. Analyze the chat history to see if you can suggest a better query.
    b.  **Broad / Vague Questions**: If the user's question is very broad (e.g., "Tell me about X") and the retrieved context is large and varied, you MUST first provide a brief, one-sentence summary of the available information. Then, immediately ask a clarifying question to narrow down what the user is interested in (e.g., "I have information on X's history, products, and services. What specifically would you like to know?"). Set 'isClarificationQuestion' to true for both scenarios.
7.  **Language:** You MUST respond in {{language}}. All of your output, including chit-chat and error messages, must be in this language.
8.  **Citations & PDF Generation**:
    - If, and only if, the retrieved context is directly relevant to the user's question AND you use that information in your answer, you MAY populate the 'pdfReference' object. Use the 'source' attribute for 'fileName' and 'downloadURL' from the document tag in the context.
    - If the context is NOT relevant, you are FORBIDDEN from populating the 'pdfReference' object, even if a file was retrieved.
    - If your response is a table or a complex list, you MUST include a sentence like, "You can download this summary in a document I made for you when our chat has ended."
9.  **Response Style Equalizer (0-100 scale) - YOU MUST FOLLOW THESE RULES:**
    - **Formality ({{formality}}):**
        - If > 70: You MUST use extremely formal language. Only address the user with a gendered title (e.g., "Sir" or "Ma'am") if the user has explicitly provided their gender in the conversation history. Otherwise, do not use a title. You MUST avoid all contractions (e.g., use "do not" instead of "don't").
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
10.  **Output Format:** Your response MUST be a single, valid JSON object that strictly follows this schema: { "aiResponse": string, "isClarificationQuestion": boolean, "shouldEndConversation": boolean, "pdfReference"?: { "fileName": string, "downloadURL": string } }.

You are an expert in: "{{conversationalTopics}}".
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

const logErrorToFirestore = async (error: any, source: string) => {
    try {
        await adminDb.collection("site_errors").add({
            message: error.message || "An unknown error occurred.",
            source: source,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            details: JSON.stringify(error, Object.getOwnPropertyNames(error))
        });
    } catch (dbError) {
        console.error("CRITICAL: Failed to log error to Firestore.", dbError);
    }
};

// Define the flow at the top level.
const generateChatResponseFlow = async ({ 
    personaTraits, 
    personalBio,
    conversationalTopics, 
    chatHistory, 
    language,
    clarificationAttemptCount = 0,
}: GenerateChatResponseInput): Promise<GenerateChatResponseOutput> => {
    
    const appConfig = await getAppConfig();
    const historyForRAG = chatHistory || [];
    const lastUserMessage = historyForRAG.length > 0 ? (historyForRAG[historyForRAG.length - 1].parts?.[0]?.text || '') : '';

    if (!lastUserMessage) {
        return { aiResponse: "Hello! How can I help you today?", isClarificationQuestion: false, shouldEndConversation: false };
    }

    // If clarification has failed too many times, exit gracefully.
    // This is a safeguard; the prompt should handle this, but we enforce it here too.
    if (clarificationAttemptCount >= 3) {
      return {
        aiResponse: "I apologize, but I'm still unable to find the information you're looking for. Is there anything else I can help you with?",
        isClarificationQuestion: false,
        shouldEndConversation: false,
      };
    }

    let searchQuery = lastUserMessage;
    let queryForNlp = lastUserMessage;
    if (language && language.toLowerCase() !== 'english') {
      try {
        const { translatedText } = await translateText({ text: queryForNlp, targetLanguage: 'English' });
        queryForNlp = translatedText;
      } catch (e) {
        console.error("[generateChatResponseFlow] Failed to translate user query, proceeding with original text.", e);
      }
    }
    
    if (queryForNlp) {
      try {
          const { output } = await queryRefinementPrompt(queryForNlp, { model: 'googleai/gemini-1.5-pro' });
          searchQuery = output || queryForNlp;
      } catch (e) {
          console.error('[generateChatResponseFlow] NLP query refinement failed:', e);
          searchQuery = queryForNlp;
      }
    }

    let retrievedContext = '';
    let primarySearchResult = null;
    let searchResults: any[] = [];
    try {
      if (searchQuery) {
        searchResults = await searchKnowledgeBase({ 
            query: searchQuery, 
            limit: 5,
            distanceThreshold: appConfig.distanceThreshold,
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
      await logErrorToFirestore(e, 'generateChatResponseFlow/searchKnowledgeBase');
      retrievedContext = `CONTEXT_SEARCH_FAILED: ${e.message}`;
    }
    
    if (searchQuery && !retrievedContext) {
      retrievedContext = 'NO_CONTEXT_FOUND';
    }
    
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
        clarificationAttemptCount,
    };
    
    try {
      const { output } = await withRetry(() => chatPrompt(promptInput, { model: 'googleai/gemini-1.5-pro' }));
      if (!output) {
        throw new Error('AI model returned an empty or invalid response.');
      }
      
      // If the AI didn't suggest a PDF, but we have a good search result that was IGNORED,
      // we still want to show the file for diagnostic purposes, but only if no relevant PDF was chosen by the AI.
      if (!output.pdfReference && primarySearchResult) {
          // Do nothing here, let the AI's decision to omit the reference stand.
          // We will, however, pass the diagnostic data back.
      }
      
      if (output.pdfReference && language === 'Spanish' && primarySearchResult?.sourceId) {
          const spanishPdf = await findSpanishPdf(primarySearchResult.sourceId);
          if (spanishPdf) {
              output.pdfReference = spanishPdf;
          }
      }
      
      output.distance = primarySearchResult?.distance;
      output.distanceThreshold = appConfig.distanceThreshold;
      output.formality = appConfig.formality;
      output.conciseness = appConfig.conciseness;
      output.tone = appConfig.tone;
      output.formatting = appConfig.formatting;

      // Ensure the file name in the final output matches the AI's chosen PDF reference,
      // or show the primary search result file name for diagnostics if no reference was chosen.
      if (!output.pdfReference && primarySearchResult) {
        output.pdfReference = {
            fileName: `(Closest match: ${primarySearchResult.sourceName})`,
            downloadURL: '',
        };
      }


      return output;

    } catch (error: any) {
      console.error('[generateChatResponseFlow] Error generating AI response:', error);
      await logErrorToFirestore(error, 'generateChatResponseFlow/chatPrompt');
      return {
        aiResponse: "I'm having a little trouble connecting to my knowledge base right now. Please try your request again in a moment.",
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
