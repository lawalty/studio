
'use server';
/**
 * @fileOverview Generates a concise, SMS-friendly response using RAG.
 *
 * - generateSmsResponse - A function that generates a short chat response for SMS.
 * - GenerateSmsResponseInput - The input type for the function.
 * - GenerateSmsResponseOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'genkit';
import { searchKnowledgeBase } from '../retrieval/vector-search';

const GenerateSmsResponseInputSchema = z.object({
  userMessage: z.string().describe('The user message to respond to.'),
  personaTraits: z
    .string()
    .describe("The persona traits that define AI Blair's conversational style."),
});
export type GenerateSmsResponseInput = z.infer<typeof GenerateSmsResponseInputSchema>;


const GenerateSmsResponseOutputSchema = z.object({
  smsResponse: z.string().describe("AI Blair's generated response, concise and under 160 characters."),
});
export type GenerateSmsResponseOutput = z.infer<typeof GenerateSmsResponseOutputSchema>;

// Schema for the prompt input, including retrieved context.
const SmsPromptInputSchema = z.object({
    userMessage: z.string(),
    personaTraits: z.string(),
    context: z.string().describe("Relevant information from the knowledge base."),
});


export async function generateSmsResponse(
  input: GenerateSmsResponseInput
): Promise<GenerateSmsResponseOutput> {
  return generateSmsResponseFlow(input);
}

const generateSmsResponseFlow = ai.defineFlow(
  {
    name: 'generateSmsResponseFlow',
    inputSchema: GenerateSmsResponseInputSchema,
    outputSchema: GenerateSmsResponseOutputSchema,
  },
  async (input) => {
    // 1. Search the knowledge base for relevant context
    const context = await searchKnowledgeBase(input.userMessage);

    // --- Start of API Key logic for Chat ---
    if (admin.apps.length === 0) { admin.initializeApp(); }
    const db = getFirestore();
    const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";
    const docRef = db.doc(FIRESTORE_KEYS_PATH);
    const docSnap = await docRef.get();
    const apiKey = docSnap.exists() ? docSnap.data()?.googleAiApiKey : null;

    let chatAi = ai; // Default instance
    if (apiKey && typeof apiKey === 'string' && apiKey.trim() !== '') {
        console.log('[generateSmsResponseFlow] Using Google AI API Key from Firestore for SMS response.');
        chatAi = genkit({
            plugins: [googleAI({ apiKey: apiKey.trim() })],
        });
    } else {
        console.log('[generateSmsResponseFlow] Using default Genkit instance (ADC) for SMS response.');
    }
    // --- End of API Key logic ---

    const prompt = chatAi.definePrompt({
        name: 'generateSmsResponsePrompt',
        input: {schema: SmsPromptInputSchema},
        output: {schema: GenerateSmsResponseOutputSchema},
        prompt: `You are AI Blair. Your personality is: {{{personaTraits}}}

You have been given context from a knowledge base to answer the user's question.
Your task is to generate a response that is EXTREMELY CONCISE and suitable for an SMS message.

**CRITICAL INSTRUCTIONS:**
1.  Your final response MUST be under 160 characters.
2.  Be direct. Do not use greetings, pleasantries, or follow-up questions.
3.  Synthesize the answer from the provided context.
4.  If the context is insufficient, simply state you don't have the information.

---
Retrieved Context:
{{{context}}}
---

User message: {{{userMessage}}}

---
Your concise SMS-ready response:`,
    });

    // 2. Construct the input for the prompt
    const promptInput = {
        ...input,
        context: context,
    };

    // 3. Call the LLM
    try {
      const {output} = await prompt(promptInput);
      if (!output || typeof output.smsResponse !== 'string') {
        console.error('[generateSmsResponseFlow] Invalid or malformed output from prompt.', output);
        return {
          smsResponse: "Error: Could not generate a valid response.",
        };
      }
      return output;
    } catch (error: any) {
      console.error('[generateSmsResponseFlow] Error calling AI model:', error);
      return {
        smsResponse: "Sorry, I'm having trouble connecting right now.",
      };
    }
  }
);
