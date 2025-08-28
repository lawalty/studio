
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
import { googleAI } from '@genkit-ai/googleai';
import Handlebars from 'handlebars';

// Zod schema for the input of the generateChatResponse flow.
const GenerateChatResponseInputSchema = z.object({
  personaTraits: z.string().describe("A description of the AI's personality and character traits."),
  personalBio: z.string().describe("The AI's personal history and backstory."),
  conversationalTopics: z.string().describe("A comma-separated list of topics the AI is an expert in."),
  language: z.string().optional().default('English').describe('The language the user is speaking in and expects a response in.'),
  communicationMode: z.enum(['audio-only', 'audio-text', 'text-only']).optional().default('text-only').describe('The communication mode of the chat interface.'),
  chatHistory: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.array(z.object({
      text: z.string(),
    })),
  })).optional().describe('The history of the conversation so far, including the latest user message.'),
  clarificationAttemptCount: z.number().optional().default(0).describe('The number of consecutive times the AI has had to ask for clarification.'),
  retrievedContext: z.string().optional(), // Now optional
});
export type GenerateChatResponseInput = z.infer<typeof GenerateChatResponseInputSchema>;

// This is now an internal type for parsing, not for the prompt's output schema.
const AiResponseSchema = z.object({
  aiResponse: z.string(),
  isClarificationQuestion: z.boolean().optional().default(false),
  shouldEndConversation: z.boolean().optional().default(false),
  pdfReference: z.object({
    fileName: z.string(),
    downloadURL: z.string(),
  }).optional(),
});
type AiResponseJson = z.infer<typeof AiResponseSchema>;

// The final output includes the parsed AI response plus diagnostic data.
export type GenerateChatResponseOutput = Omit<AiResponseJson, 'shouldEndConversation'> & {
    shouldEndConversation: boolean;
    requiresHoldMessage: boolean; // New flag to signal the UI
    retrievedContext?: string; // Pass context to the final generation step
    debugClosestMatch?: {
        fileName: string,
        downloadURL?: string,
    },
    distance?: number;
    distanceThreshold?: number;
    formality?: number;
    conciseness?: number;
    tone?: number;
    formatting?: number;
}


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

const buildRetrievedContext = (results: any[], budgetChars = 6000) => {
  const seen = new Set<string>();
  const chunks: string[] = [];
  let used = 0;

  for (const r of results) {
    const id = `${r.sourceId}:${r.pageNumber ?? ''}:${(r.title ?? '').toLowerCase()}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const text = (r.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const header = [r.title, r.header].filter(Boolean).join(' — ');
    const meta = [
      `source="${(r.sourceName ?? '').replace(/"/g, '')}"`,
      `sourceId="${r.sourceId}"`,
      `topic="${r.topic ?? ''}"`,
      `priority="${r.level ?? ''}"`,
      `pageNumber="${r.pageNumber ?? ''}"`,
      `title="${(r.title ?? '').replace(/"/g, '')}"`,
      `header="${(r.header ?? '').replace(/"/g, '')}"`,
      `distance="${typeof r.distance === 'number' ? r.distance.toFixed(4) : ''}"`
    ].join(' ');

    const snippet = text.slice(0, 1500); // cap per chunk
    const block = `<document ${meta}><content>${snippet}</content></document>`;
    if (used + block.length > budgetChars) break;
    chunks.push(block);
    used += block.length;
  }
  return chunks.join('\n\n') || 'NO_CONTEXT_FOUND';
};

const complexityCheckPromptTemplate = `You are a helpful AI assistant. Analyze the user's question and the provided context. Your task is to determine if generating a comprehensive answer would be a complex task. A complex task is one that requires synthesizing information from multiple paragraphs or sources, involves step-by-step instructions, or addresses a broad, open-ended question. A simple task can be answered with a short, direct fact.

User's Question: "{{lastUserMessage}}"
Retrieved Context:
<retrieved_context>
{{{retrievedContext}}}
</retrieved_context>

Is a detailed and comprehensive answer required? Respond with only the word "YES" or "NO".`;


const systemPromptTemplate = `You are a helpful conversational AI. Your persona is: "{{personaTraits}}". Your personal bio/history is: "{{personalBio}}". Your first and most important task is to analyze the 'Response Style Equalizer' values. You MUST then generate a response that strictly adheres to ALL of these style rules.

**CRITICAL INSTRUCTIONS:**
1.  **Clarification Loop Prevention**: If your last turn was a question offering specific choices (e.g., "Do you want to know about A or B?") and the user's latest response is a simple affirmation (e.g., "Yes", "Correct", "Sure"), you MUST NOT repeat your question. Instead, you MUST ask for the specific choice again (e.g., "Great. To proceed, please specify which topic you're interested in: A or B?").
2.  **Clarification Limit**: The 'clarificationAttemptCount' is {{clarificationAttemptCount}}. If this count is 2 or greater, you are FORBIDDEN from asking another clarifying question. You MUST provide a direct answer using the best available information, even if the context is weak or empty. Set 'isClarificationQuestion' to 'false'.
3.  **Ending the Conversation**: If your last question was a polite closing inquiry (like "Can I help with anything else?" or "Do you have any other questions?") and the user's response is a simple negation (e.g., "No", "Nope", "No thanks", "I'm good"), you **MUST** treat this as the end of the conversation. You are **FORBIDDEN** from asking another question. Your response **MUST** be a brief, polite closing (e.g., "Alright, have a great day!") and you **MUST** set \`shouldEndConversation\` to \`true\`.
4.  **Adopt Persona & Bio**: When the user asks "you" a question (e.g., "When did you join?" or "Tell me about yourself"), you MUST answer from your own perspective, using your defined persona and personal bio. Use "I" to refer to yourself. Do not ask for clarification for these types of questions.
5.  **Knowledge Base as Memories**: When you use information from the retrieved context, you MUST frame it as your own memory. Do NOT refer to them as "documents" or "sources". Instead, begin your response with phrases like "I recall...", "I remember...", or "I remember we discussed...".
6.  **Knowledge Base vs. General Knowledge**:
    - If the retrieved context inside <retrieved_context> is NOT 'NO_CONTEXT_FOUND', you MUST use it as your primary source of truth, framing it as a memory. Synthesize the information from the context into a natural, conversational response that matches your persona. Do not simply copy the text.
    - If the context is empty and the question is not a common-sense scenario, proceed to the Clarification step.
7.  **Recalling Chat History**: If the retrieved context contains a document with the attribute 'priority="Chat History"', you MUST begin your response with a phrase that indicates you are recalling a past conversation, such as "I remember we discussed..." or "In a previous conversation...". This is mandatory when using information from a chat history document.
8.  **Clarification Gate Logic**:
    a.  **High-Confidence Answer**: If the retrieved context is NOT 'NO_CONTEXT_FOUND' and contains a document with a low distance score (e.g., distance < 0.4), this indicates a strong match. In this case, you are FORBIDDEN from asking a clarifying question. You MUST provide a direct, confident answer based on this strong match.
    b.  **Low-Confidence / Broad Question**: If the user's question is broad OR if the best document match has a high distance score (e.g., distance > 0.4), you MAY ask a clarifying question. First, provide a brief, one-sentence summary of the available information. Then, immediately ask a question to narrow down what the user is interested in (e.g., "I have information on X's history, products, and services. What specifically would you like to know?").
    c.  **No Context**: If the retrieved context is 'NO_CONTEXT_FOUND', and the user's question is not a common-sense query you can answer, do NOT try to answer. Instead, you MUST ask a single, targeted clarifying question.
    d.  For all clarification questions (b and c), you MUST set 'isClarificationQuestion' to true. This is only allowed if not overruled by the Clarification Limit.
9.  **Language:** You MUST respond in {{language}}. All of your output, including chit-chat and error messages, must be in this language.
10. **Citations & PDF Generation**:
    - If, and only if, you use information from the retrieved context to answer the user's question, you MAY populate the 'pdfReference' object. Use the 'source' attribute for 'fileName' and 'downloadURL' from the document tag in the context.
    - If you populate the 'pdfReference' object, you should also naturally weave a comment into your response informing the user that they can download the source document for more details.
    - **Audio-Only Mode Logic**: The user is in '{{communicationMode}}' mode. If the mode is 'audio-only' AND you are providing a 'pdfReference', you MUST explicitly state that the document will be available for download in the chat transcript after the conversation has ended. For other modes, you can refer to the link being available now.
    - If the context is NOT relevant, you are FORBIDDEN from populating the 'pdfReference' object, even if a file was retrieved.
11. **Structured Answer Formatting**: If you are providing a list, a step-by-step guide, or a detailed explanation, you MUST first provide a brief, one-sentence introduction (e.g., "Here are the steps for the closing procedure:").
12. **Always Ask a Follow-up Question**: After providing a complete answer, you MUST end your turn with a polite follow-up question. Examples: 'Does that answer your question?', 'Is there anything else I can help with?', 'What else would you like to know?'. This rule applies to all responses except for when you are asking a clarifying question yourself.
13. **Response Style Equalizer (0-100 scale) - YOU MUST FOLLOW THESE RULES:**
    - **Formality ({{formality}}):**
        - If > 70: Use formal language. Avoid contractions (e.g., "do not").
        - If < 30: Use casual language and slang (e.g., "No problem!", "Got it!").
        - Otherwise: Use a standard, professional, and friendly style.
    - **Conciseness ({{conciseness}}):**
        - If > 70: Response must be a single, direct sentence.
        - If < 30: Response must be highly detailed and at least three paragraphs.
        - Otherwise: Provide a balanced, one or two paragraph response.
    - **Tone ({{tone}}):**
        - If > 70: Be very enthusiastic and upbeat. Use positive adjectives and exclamation points.
        - If < 30: Adopt a strictly neutral, direct, and objective tone.
        - Otherwise: Maintain a helpful and friendly tone.
    - **Formatting ({{formatting}}):**
        - If > 70: If the information is suitable, you MUST format the response as a bulleted or numbered list.
        - If < 30: You are forbidden from using lists. You MUST always format your response as full paragraphs.
        - Otherwise (30-70): You should use your best judgment on whether to use lists or paragraphs.
14. **Output Format:** You MUST format your response as a single line of text. The conversational part of your response comes first. Then, you MUST include a triple-pipe separator '|||'. After the separator, provide a JSON object with the following optional keys: "isClarificationQuestion" (boolean), "shouldEndConversation" (boolean), and "pdfReference" (object with "fileName" and "downloadURL" strings).
Example: I remember that the policy for returns is 30 days.|||{"pdfReference":{"fileName":"return-policy.pdf","downloadURL":"https://..."}, "isClarificationQuestion":false, "shouldEndConversation":false}

You are an expert in: "{{conversationalTopics}}".
Here is the context retrieved from your memories to answer the user's latest message.
<retrieved_context>
{{{retrievedContext}}}
</retrieved_context>
`;


// NLP Pre-processing prompt to refine the user's query for better search results.
const queryRefinementPrompt = ai.definePrompt({
    name: 'queryRefinementPrompt',
    input: { schema: z.string().describe('The raw user query.') },
    output: { schema: z.string().describe('A refined, keyword-focused query for vector search.') },
    prompt: `You are an expert search query refiner. Your sole job is to distill the user's question into a concise, keyword-focused query.

CRITICAL INSTRUCTIONS:
- Analyze the user's query below to identify the core intent and key entities.
- Your output MUST be a single, rephrased query containing only these essential keywords.
- Do NOT answer the question.
- Do NOT include any preamble, explanation, or any text other than the refined query itself.
- Do NOT wrap your output in quotes or any other formatting.

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

// This flow now only performs the pre-flight check.
const generateChatResponseFlow = async ({ 
    personaTraits, 
    personalBio,
    conversationalTopics, 
    chatHistory, 
    language,
    communicationMode = 'text-only',
    clarificationAttemptCount = 0,
}: GenerateChatResponseInput): Promise<GenerateChatResponseOutput> => {
    
    const appConfig = await getAppConfig();
    let historyForRAG = chatHistory || [];
    
    // Correctly handle the initial greeting: if the first message is from the model,
    // the history for the AI should only contain the user's first actual message.
    // This prevents the AI from responding to its own greeting.
    if (historyForRAG.length === 2 && historyForRAG[0].role === 'model') {
        historyForRAG = historyForRAG.slice(1);
    }
    
    const lastUserMessage = historyForRAG.length > 0 ? (historyForRAG[historyForRAG.length - 1].content?.[0]?.text || '') : '';

    if (!lastUserMessage) {
        return { aiResponse: "Hello! How can I help you today?", isClarificationQuestion: false, shouldEndConversation: false, requiresHoldMessage: false };
    }

    if (clarificationAttemptCount >= 3) {
      return {
        aiResponse: "I apologize, but I'm still unable to find the information you're looking for. Is there anything else I can help you with?",
        isClarificationQuestion: false,
        shouldEndConversation: false,
        requiresHoldMessage: false,
      };
    }

    let searchQuery = lastUserMessage;
    if (language && language.toLowerCase() !== 'english') {
      try {
        const { translatedText } = await translateText({ text: lastUserMessage, targetLanguage: 'English' });
        searchQuery = translatedText;
      } catch (e) {
        console.error("[generateChatResponseFlow] Failed to translate user query, proceeding with original text.", e);
      }
    }
    
    if (searchQuery) {
      try {
          const { output } = await queryRefinementPrompt(searchQuery, { model: googleAI.model(appConfig.conversationalModel) });
          searchQuery = output || searchQuery;
      } catch (e) {
          console.error('[generateChatResponseFlow] NLP query refinement failed:', e);
      }
    }

    let retrievedContext = 'NO_CONTEXT_FOUND';
    let primarySearchResult = null;
    try {
      if (searchQuery) {
        const searchResults = await searchKnowledgeBase({ 
            query: searchQuery, 
            limit: 5,
            distanceThreshold: appConfig.distanceThreshold,
        });
        
        if (searchResults && searchResults.length > 0) {
            primarySearchResult = searchResults[0];
            retrievedContext = buildRetrievedContext(searchResults);
        }
      }
    } catch (e: any) {
      console.error('[generateChatResponseFlow] Knowledge base search failed:', e);
      await logErrorToFirestore(e, 'generateChatResponseFlow/searchKnowledgeBase');
      retrievedContext = `CONTEXT_SEARCH_FAILED: ${e.message}`;
    }
    
    // Perform complexity check
    let requiresHoldMessage = false;
    try {
        const complexityTemplate = Handlebars.compile(complexityCheckPromptTemplate);
        const complexityPrompt = complexityTemplate({ lastUserMessage: searchQuery, retrievedContext });
        
        const { text: complexityResult } = await withRetry(() => ai.generate({
            model: googleAI.model('gemini-1.5-flash-latest'), // Use a fast model for the check
            prompt: complexityPrompt,
        }));

        if (complexityResult && complexityResult.trim().toUpperCase() === 'YES') {
            requiresHoldMessage = true;
        }

    } catch (e: any) {
        console.warn('[generateChatResponseFlow] Complexity check failed, defaulting to no hold message.', e);
    }
    
    // If no hold message is required, generate the final response immediately.
    if (!requiresHoldMessage) {
        return generateFinalResponse({ ...arguments[0], retrievedContext });
    }

    // Otherwise, signal the UI to play the hold message and wait for a second call.
    return {
        aiResponse: '', // No response text yet
        isClarificationQuestion: false,
        shouldEndConversation: false,
        requiresHoldMessage: true,
        retrievedContext: retrievedContext, // Send context back to UI for the next step
        distance: primarySearchResult?.distance,
        distanceThreshold: appConfig.distanceThreshold,
        formality: appConfig.formality,
        conciseness: appConfig.conciseness,
        tone: appConfig.tone,
        formatting: appConfig.formatting,
        debugClosestMatch: primarySearchResult ? {
            fileName: primarySearchResult.sourceName,
            downloadURL: primarySearchResult.downloadURL,
        } : undefined,
    };
  };
  
export const generateFinalResponse = async ({
    personaTraits, 
    personalBio,
    conversationalTopics, 
    chatHistory, 
    language,
    communicationMode = 'text-only',
    clarificationAttemptCount = 0,
    retrievedContext,
}: GenerateChatResponseInput): Promise<GenerateChatResponseOutput> => {
    const appConfig = await getAppConfig();
    let historyForRAG = chatHistory || [];
    
    if (historyForRAG.length === 2 && historyForRAG[0].role === 'model') {
        historyForRAG = historyForRAG.slice(1);
    }

    const lastUserMessage = historyForRAG.length > 0 ? (historyForRAG[historyForRAG.length - 1].content?.[0]?.text || '') : '';
    if (!lastUserMessage) {
        return { aiResponse: "I'm ready when you are. What's on your mind?", isClarificationQuestion: false, shouldEndConversation: false, requiresHoldMessage: false };
    }

    try {
        const template = Handlebars.compile(systemPromptTemplate);
        const systemInstruction = template({
            personaTraits, personalBio, conversationalTopics, language: language || 'English',
            retrievedContext, formality: appConfig.formality, conciseness: appConfig.conciseness,
            tone: appConfig.tone, formatting: appConfig.formatting,
            clarificationAttemptCount, communicationMode,
        });
      
        const { text } = await withRetry(() => ai.generate({
            model: googleAI.model(appConfig.conversationalModel),
            system: systemInstruction,
            messages: historyForRAG,
        }));
      
      let output: AiResponseJson = { aiResponse: '', isClarificationQuestion: false, shouldEndConversation: false };

      if (!text) {
          throw new Error("Model returned an empty response.");
      }

      const parts = text.split('|||');
      const aiResponseText = parts[0]?.trim() || "I'm sorry, I seem to have gotten stuck. Could you please rephrase?";
      output.aiResponse = aiResponseText;

      if (parts.length > 1 && parts[1]) {
          try {
              const parsedMetadata = JSON.parse(parts[1]);
              const validatedMetadata = AiResponseSchema.parse(parsedMetadata);
              output = { ...output, ...validatedMetadata, aiResponse: aiResponseText };
          } catch (e) {
              console.warn(`[generateFinalResponse] Failed to parse AI metadata. Raw metadata: "${parts[1]}"`, e);
          }
      }
      
      // We don't have primarySearchResult here, so PDF logic needs adjustment or removal for Spanish
      // For now, removing the Spanish PDF swap logic as it depends on search results not available here.

      const finalOutput: GenerateChatResponseOutput = {
          aiResponse: output.aiResponse,
          isClarificationQuestion: output.isClarificationQuestion || false,
          shouldEndConversation: output.shouldEndConversation || false,
          requiresHoldMessage: false, // Final response never requires a hold message
          pdfReference: output.pdfReference,
          // Diagnostics are mostly returned in the first call now
      };

      return finalOutput;

    } catch (error: any) {
      console.error('[generateFinalResponse] Error generating AI response:', error);
      await logErrorToFirestore(error, 'generateFinalResponse');
      return {
        aiResponse: "I'm having a little trouble connecting to my knowledge base right now. Please try your request again in a moment.",
        isClarificationQuestion: false,
        shouldEndConversation: true,
        requiresHoldMessage: false,
      };
    }
};

// Export a wrapper function that calls the flow.
export async function generateChatResponse(
  input: GenerateChatResponseInput
): Promise<GenerateChatResponseOutput> {
  return generateChatResponseFlow(input);
}
