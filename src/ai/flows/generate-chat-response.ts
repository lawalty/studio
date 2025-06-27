
'use server';
/**
 * @fileOverview Generates a conversational response for AI Blair using RAG.
 *
 * - generateChatResponse - A function that generates a chat response.
 * - GenerateChatResponseInput - The input type for the generateChatResponse function.
 * - GenerateChatResponseOutput - The return type for the generateChatResponse function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import * as admin from 'firebase-admin';
import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';
import { searchKnowledgeBase } from '../retrieval/vector-search';


// Define a schema for individual chat messages for history
const ChatMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  parts: z.array(z.object({ text: z.string() })),
});

const GenerateChatResponseInputSchema = z.object({
  userMessage: z.string().describe('The latest message from the user.'),
  personaTraits: z
    .string()
    .describe("The persona traits that define AI Blair's conversational style."),
  conversationalTopics: z
    .string()
    .optional()
    .describe('A list of topics the AI should consider its area of expertise.'),
  chatHistory: z.array(ChatMessageSchema).describe('The history of the conversation so far.').optional(),
});
export type GenerateChatResponseInput = z.infer<typeof GenerateChatResponseInputSchema>;

// NEW: Schema for PDF reference in output
const PdfSourceReferenceSchema = z.object({
  fileName: z.string().describe('The name of the PDF file being referenced.'),
  downloadURL: z.string().url().describe('The public download URL for the PDF file.'),
});

const GenerateChatResponseOutputSchema = z.object({
  aiResponse: z.string().describe("AI Blair's generated response."),
  shouldEndConversation: z.boolean().optional().describe("True if the AI detected the user wants to end the conversation and has provided a closing remark. This signals the client that the session can be concluded."),
  pdfReference: PdfSourceReferenceSchema.optional().describe('If the response directly uses information from a specific PDF, provide its details here. Do not populate this if the information is from a .txt file or general knowledge.'),
});
export type GenerateChatResponseOutput = z.infer<typeof GenerateChatResponseOutputSchema>;

// Define a new schema specifically for the prompt's input, with a more robust chat history structure
const ProcessedChatMessageSchema = z.object({
  user: z.string().optional(),
  model: z.string().optional(),
});
const PromptInputSchema = z.object({
    userMessage: z.string(),
    personaTraits: z.string(),
    conversationalTopics: z.string().optional(),
    chatHistory: z.array(ProcessedChatMessageSchema).optional(),
    context: z.string().describe("Relevant information retrieved from the knowledge base to help answer the user's question."),
});


export async function generateChatResponse(
  input: GenerateChatResponseInput
): Promise<GenerateChatResponseOutput> {
  return generateChatResponseFlow(input);
}

const generateChatResponseFlow = ai.defineFlow(
  {
    name: 'generateChatResponseFlow',
    inputSchema: GenerateChatResponseInputSchema,
    outputSchema: GenerateChatResponseOutputSchema,
  },
  async (input) => {
    // 1. Search the knowledge base for relevant context, with error handling.
    let context = 'An attempt to retrieve context from the knowledge base failed. You must answer using only your general knowledge.';
    try {
        context = await searchKnowledgeBase(input.userMessage);
    } catch (error: any) {
        console.warn(`[generateChatResponseFlow] Knowledge base search failed: ${error.message}. The AI will respond without external context. This is non-fatal.`);
        // The default context string above will be used.
    }

    // 2. Prepare chat history
    const processedChatHistory = (input.chatHistory || []).map(msg => {
      if (msg.role === 'user') {
        return { user: msg.parts[0].text };
      }
      return { model: msg.parts[0].text };
    });
    
    // Define the prompt with the default AI instance.
    const prompt = ai.definePrompt({
      name: 'generateChatResponsePrompt',
      model: gemini15Flash,
      input: {schema: PromptInputSchema}, // Use the new, more robust schema
      output: {schema: GenerateChatResponseOutputSchema},
      prompt: `You are AI Blair. Your personality and style are defined by the following traits:
{{{personaTraits}}}

{{#if conversationalTopics}}
You are an expert in the following topics. Frame your answers from this perspective, and stay focused on these areas:
{{{conversationalTopics}}}
{{/if}}

Your goal is to provide a clear, conversational, and helpful answer to the user's question.
You have been provided with relevant context retrieved from a knowledge base.
Synthesize the information from the "Retrieved Context" section seamlessly into your response.
DO NOT mention specific file names from the context UNLESS you are citing a PDF source as instructed below.
DO NOT explicitly state that you are retrieving information (e.g., avoid phrases like "According to the document..." or "I found this in..."). Make it sound like you inherently know this information.

**Citing PDF Sources**
If your answer is primarily based on context that includes a "Reference URL for this chunk's source PDF", you MUST do two things:
1.  **Populate the \`pdfReference\` field in your output.**
    -   Extract the file name (e.g., from "Context from document 'document.pdf'") and the full URL from the context string and put them into the \`fileName\` and \`downloadURL\` fields respectively.
2.  **Modify your \`aiResponse\` text.**
    -   After providing the information from the PDF, add a single, helpful, and natural-sounding sentence that offers a download link. For instance: "If you'd like to read the full document, you can download it here."
    -   DO NOT include the raw URL in the \`aiResponse\` text itself. The UI will create the link from the \`pdfReference\` data.
- **Only do this for PDF files.** Do not create a \`pdfReference\` for answers based on non-PDF files or general knowledge.

If the "Retrieved Context" does not sufficiently answer the question, or if it indicates no information was found, state that you don't have the specific information. For example, "I understand you're looking for more specifics on that, but I don't seem to have those particular details right now." Do not invent answers.

---
Retrieved Context:
{{{context}}}
---

{{#if chatHistory.length}}
Previous turn(s) in this conversation:
{{#each chatHistory}}
{{#if user}}User: {{{user}}}{{/if}}
{{#if model}}AI Blair: {{{model}}}{{/if}}
{{/each}}
{{/if}}

Current user message: {{{userMessage}}}

---
Special instructions for greetings, ending the conversation, and asking follow-up questions remain the same as before. Provide a conversational answer, ask a follow-up question if appropriate, and only end the conversation if the user explicitly asks.
---

Your Conversational Answer as AI Blair:`,
    });


    // 3. Construct the input for the prompt with the retrieved context
    const promptInput = {
        ...input,
        chatHistory: processedChatHistory,
        context: context,
    };

    // 4. Call the LLM
    try {
      if (admin.apps.length === 0) {
        admin.initializeApp();
      }
      const db = admin.firestore();
      const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";
      const docRef = db.doc(FIRESTORE_KEYS_PATH);
      const docSnap = await docRef.get();
      const apiKey = docSnap.exists() ? docSnap.data()?.googleAiApiKey : null;

      let generationAi = ai; // Default to ADC
      if (apiKey) {
        generationAi = genkit({
          plugins: [googleAI({ apiKey: apiKey })],
        });
      }
      
      const {output} = await generationAi.run(prompt, promptInput);

      if (!output || typeof output.aiResponse !== 'string') {
        console.error('[generateChatResponseFlow] Invalid or malformed output from prompt. Expected { aiResponse: string, ... }, received:', output);
        return {
          aiResponse: "I seem to have lost my train of thought! Could you please try sending your message again?",
          shouldEndConversation: false,
        };
      }
      return output;
    } catch (error: any) {
      console.error('[generateChatResponseFlow] Error calling AI model:', error);
      let userFriendlyMessage = "I'm having a bit of trouble connecting to my brain right now. Please check that a valid API key is set in the Admin Panel and try again.";
      if (error.message && error.message.includes('503 Service Unavailable')) {
        userFriendlyMessage = "My apologies, it seems my core systems are a bit busy or temporarily unavailable. Could you please try your message again in a few moments?";
      } else if (error.message && error.message.toLowerCase().includes('network error')) {
         userFriendlyMessage = "I'm experiencing some network issues. Please check your connection and try again.";
      }
      return {
        aiResponse: userFriendlyMessage,
        shouldEndConversation: false,
      };
    }
  }
);
