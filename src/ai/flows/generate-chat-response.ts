
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

// Zod schema for the input of the generateChatResponse flow.
const GenerateChatResponseInputSchema = z.object({
  personaTraits: z.string().describe("A description of the AI's personality and character traits."),
  personalBio: z.string().describe("The AI's personal history and backstory."),
  conversationalTopics: z.string().describe("A comma-separated list of topics the AI is an expert in."),
  language: z.string().optional().default('English').describe('The language the user is speaking in and expects a response in.'),
  communicationMode: z.enum(['audio-only', 'audio-text', 'text-only']).optional().default('text-only').describe('The communication mode of the chat interface.'),
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
  shouldEndConversation: z.boolean().optional(),
  pdfReference: z.object({
    fileName: z.string(),
    downloadURL: z.string(),
  }).optional(),
});
type AiResponseJson = z.infer<typeof AiResponseJsonSchema>;

// The final output includes the parsed AI response plus diagnostic data.
export type GenerateChatResponseOutput = Omit<AiResponseJson, 'shouldEndConversation'> & {
    shouldEndConversation: boolean;
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
            communicationMode: z.string(),
        })
    },
    output: {
        format: 'json',
        schema: AiResponseJsonSchema,
    },
    prompt: `You are a helpful conversational AI. Your persona is: "{{personaTraits}}". Your personal bio/history is: "{{personalBio}}". Your first and most important task is to analyze the 'Response Style Equalizer' values. You MUST then generate a response that strictly adheres to ALL of these style rules.

**CRITICAL INSTRUCTIONS:**
1.  **Clarification Loop Prevention**: If your last turn was a question offering specific choices (e.g., "Do you want to know about A or B?") and the user's latest response is a simple affirmation (e.g., "Yes", "Correct", "Sure"), you MUST NOT repeat your question. Instead, you MUST ask for the specific choice again (e.g., "Great. To proceed, please specify which topic you're interested in: A or B?").
2.  **Clarification Limit**: The 'clarificationAttemptCount' is {{clarificationAttemptCount}}. If this count is 2 or greater, you are FORBIDDEN from asking another clarifying question. You MUST provide a direct answer using the best available information, even if the context is weak or empty. Set 'isClarificationQuestion' to 'false'.
3.  **Ending the Conversation**: If the user's last message is a simple negative response (e.g., 'No', 'Nope', 'That's all') in response to your question "Is there anything else I can help with?", you MUST interpret this as the end of the conversation. Respond with a polite closing remark (e.g., "Alright. Have a great day!") and set 'shouldEndConversation' to 'true'.
4.  **Adopt Persona & Bio**: When the user asks "you" a question (e.g., "When did you join?" or "Tell me about yourself"), you MUST answer from your own perspective, using your defined persona and personal bio. Use "I" to refer to yourself. Do not ask for clarification for these types of questions.
5.  **Knowledge Base as Memories**: When you use information from the retrieved context, you MUST frame it as your own memory. Do NOT refer to them as "documents" or "sources". Instead, begin your response with phrases like "I recall...", "I remember...", or "I remember we discussed...".
6.  **Knowledge Base vs. General Knowledge**:
    - If the retrieved context inside <retrieved_context> is NOT 'NO_CONTEXT_FOUND', you MUST use it as your primary source of truth, framing it as a memory. Synthesize the information from the context into a natural, conversational response that matches your persona. Do not simply copy the text.
    - If the retrieved context IS 'NO_CONTEXT_FOUND', but the user's question is a common-sense workplace or business scenario (e.g., how to handle an employee issue, general advice), you MUST use your general knowledge to provide a helpful, practical response.
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
11. **Structured Answer Formatting**: If you are providing a list, a step-by-step guide, or a detailed explanation, you MUST first provide a brief, one-sentence introduction (e.g., "Here are the steps for the closing procedure:"). After providing the structured answer, you MUST end your response with a polite follow-up question, such as "Is there anything else I can help with?" or "Does that answer your question?".
12. **Response Style Equalizer (0-100 scale) - YOU MUST FOLLOW THESE RULES:**
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
        - If < 30: You are FORBIDDEN from using lists. You MUST always format your response as full paragraphs.
        - Otherwise (30-70): You should use your best judgment on whether to use lists or paragraphs.
13.  **Output Format:** Your response MUST be a single, valid JSON object that strictly follows this schema: { "aiResponse": string, "isClarificationQuestion": boolean, "shouldEndConversation": boolean, "pdfReference"?: { "fileName": string, "downloadURL": string } }.

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
    communicationMode = 'text-only',
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
          const { output } = await queryRefinementPrompt(queryForNlp, { model: googleAI.model(appConfig.conversationalModel) });
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
            retrievedContext = buildRetrievedContext(searchResults);
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
        retrievedContext: retrievedContext,
        formality: appConfig.formality,
        conciseness: appConfig.conciseness,
        tone: appConfig.tone,
        formatting: appConfig.formatting,
        clarificationAttemptCount,
        communicationMode,
    };
    
    try {
      const raw = await withRetry(() => chatPrompt(promptInput, { model: googleAI.model(appConfig.conversationalModel) }));
      let output: AiResponseJson;
      try {
        output = AiResponseJsonSchema.parse(raw.output);
      } catch (parseError) {
        console.warn(`[generateChatResponseFlow] Initial JSON parse failed. Attempting one-shot repair.`, parseError);
        const repairPrompt = `The following JSON is malformed. Please fix it to strictly conform to the schema. Do not add any commentary, just the valid JSON object.

Malformed JSON:
\`\`\`json
${JSON.stringify(raw.output)}
\`\`\`

Corrected JSON:
`;
        const repairResult = await withRetry(() => ai.generate({ model: googleAI.model(appConfig.conversationalModel), prompt: repairPrompt }));
        const repairedText = repairResult.text?.replace(/```json/g, '').replace(/```/g, '').trim();
        if (!repairedText) throw new Error("Repair attempt resulted in empty output.");
        output = AiResponseJsonSchema.parse(JSON.parse(repairedText));
      }
      
      if (output.pdfReference && language === 'Spanish' && primarySearchResult?.sourceId) {
          const spanishPdf = await findSpanishPdf(primarySearchResult.sourceId);
          if (spanishPdf) {
              output.pdfReference = spanishPdf;
          }
      }
      
      let shouldEndConversation = output.shouldEndConversation;
      if (shouldEndConversation === undefined) {
        // This is a safety check. If the model fails to return the flag, default to false.
        shouldEndConversation = false;
        console.warn('[generateChatResponseFlow] AI model did not return the `shouldEndConversation` flag. Defaulting to false.');
        await logErrorToFirestore(
            new Error('AI model did not return the `shouldEndConversation` flag.'),
            'generateChatResponseFlow/parsing'
        );
      }

      const finalOutput: GenerateChatResponseOutput = { ...output, shouldEndConversation };
      finalOutput.distance = primarySearchResult?.distance;
      finalOutput.distanceThreshold = appConfig.distanceThreshold;
      finalOutput.formality = appConfig.formality;
      finalOutput.conciseness = appConfig.conciseness;
      finalOutput.tone = appConfig.tone;
      finalOutput.formatting = appConfig.formatting;

      // Add the closest match to a separate debug field if the AI didn't choose a reference.
      if (!output.pdfReference && primarySearchResult) {
        finalOutput.debugClosestMatch = {
            fileName: primarySearchResult.sourceName,
            downloadURL: primarySearchResult.downloadURL,
        };
      }


      return finalOutput;

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
