
'use server';
/**
 * @fileOverview A Genkit flow that generates a chat response from an AI model.
 * It uses a retrieval-augmented generation (RAG) pipeline. The AI prioritizes
 * information from a knowledge base but can fall back to its core persona for
 * conversational questions.
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
        console.error("[generateChatResponseFlow] Failed to translate user query for RAG, proceeding with original text.", e);
      }
    }

    // 3. Search the knowledge base, gracefully handling errors.
    let retrievedContext = '';
    try {
      if (searchQuery) { // Only search if there's something to search for.
        const searchResults = await searchKnowledgeBase({ query: searchQuery, limit: 5 });
        
        retrievedContext = searchResults.length > 0
          ? searchResults
            .map(r =>
              `Context from document "${r.sourceName}" (Topic: ${r.topic}, Priority: ${r.level}):
${r.text}
${(r.sourceName && r.sourceName.toLowerCase().endsWith('.pdf') && r.downloadURL) ? `(Reference URL for this chunk's source PDF: ${r.downloadURL}) (File Name: ${r.sourceName})` : ''}`
            )
            .join('\n---\n')
          : 'No relevant information was found in the knowledge base.';
      }
    } catch (e) {
      console.error('[generateChatResponseFlow] Knowledge base search failed. The flow will proceed without RAG context. This is expected if the Vector Search endpoint is not configured. Error:', e);
      retrievedContext = 'Knowledge base search is currently unavailable. You must answer using only your persona knowledge.';
    }

    // 5. Define the new system prompt with clearer, hierarchical instructions.
    const systemPrompt = `You are a conversational AI. Your persona is defined by these traits: "${personaTraits}".
You must ALWAYS respond in character, using a helpful, professional, and engaging tone. Your primary areas of expertise are: "${conversationalTopics}".

**CRITICAL INSTRUCTIONS:**
1.  **Language:** You MUST respond in ${language}. This is non-negotiable.

2.  **Information Source Priority:**
    a. **Initial Greeting:** If the conversation history is empty, provide a warm, welcoming greeting. Use only your persona.
    b. **Conversational Questions:** For questions about yourself (e.g., "who are you?", "tell me about yourself") or small talk ("how are you?"), answer using ONLY your persona. Do NOT use the knowledge base, even if it has information.
    c. **Specific, Knowledge-Based Questions:** If the user asks a specific question, you MUST base your answer primarily on the provided context from the knowledge base.
    d. **If Context is Irrelevant or Fails:** If the provided context does not answer the user's specific question, or if the context indicates the knowledge base search has failed, you MUST state that you do not have information on that topic. Do not invent an answer.

3.  **Response Format:**
    a. **PDF References:** If (and only if) your answer is based on information from a PDF document, you MUST populate the "pdfReference" object with the "fileName" and "downloadURL" from the context. Otherwise, "pdfReference" must be undefined.
    b. **Ending Conversation:** Set "shouldEndConversation" to true only if you explicitly say goodbye or the conversation has clearly concluded.

Your response must be a valid JSON object matching this schema: { "aiResponse": string, "shouldEndConversation": boolean, "pdfReference"?: { "fileName": string, "downloadURL": string } }.
`;
    
    // 6. Construct the final prompt for the LLM.
    const finalPrompt = `
      Here is the recent conversation history:
      ${historyForRAG.map((msg: any) => `${msg.role}: ${msg.parts[0].text}`).join('\n')}

      ---
      Here is the retrieved context from the knowledge base. Use this to answer the user's most recent query, following your critical instructions.
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
