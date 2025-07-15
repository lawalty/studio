'use server';
/**
 * @fileOverview A self-contained flow to handle the entire lifecycle of an inbound SMS.
 * This flow isolates all server-side logic for receiving an SMS, generating a
 * response, and sending a reply, preventing build issues in the API route.
 *
 * - handleInboundSms - The main function to process the SMS.
 * - HandleInboundSmsInput - The input type for the function.
 */
import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { db } from '@/lib/firebase-admin';
import { searchKnowledgeBase } from '../retrieval/vector-search';
import twilio from 'twilio';

const FIRESTORE_SITE_ASSETS_PATH = 'configurations/site_display_assets';
const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";
const DEFAULT_PERSONA_TRAITS = 'You are AI Blair, a helpful assistant.';

export const HandleInboundSmsInputSchema = z.object({
  fromPhoneNumber: z.string(),
  userMessage: z.string(),
});
export type HandleInboundSmsInput = z.infer<typeof HandleInboundSmsInputSchema>;

// Define the schema for the AI prompt's input
const SmsPromptInputSchema = z.object({
    userMessage: z.string(),
    personaTraits: z.string(),
    context: z.string().describe("Relevant information from the knowledge base."),
});

// Define the schema for the AI prompt's output
const SmsResponseOutputSchema = z.object({
  smsResponse: z.string().describe("AI Blair's generated response, concise and under 160 characters."),
});

export async function handleInboundSms(input: HandleInboundSmsInput): Promise<void> {
  // 1. Fetch persona traits for the AI to use in its response.
  let personaTraits = DEFAULT_PERSONA_TRAITS;
  try {
    const docRef = db.doc(FIRESTORE_SITE_ASSETS_PATH);
    const docSnap = await docRef.get();
    if (docSnap.exists && docSnap.data()?.personaTraits) {
      personaTraits = docSnap.data()!.personaTraits;
    }
  } catch (e) {
    console.warn('Could not fetch persona traits for SMS response, using default.', e);
  }

  // 2. Search the knowledge base for relevant context
  const searchResult = await searchKnowledgeBase({ query: input.userMessage, limit: 3 });

  // 3. Define the prompt for the AI
  const prompt = ai.definePrompt({
      name: 'generateSmsResponsePrompt',
      input: {schema: SmsPromptInputSchema},
      output: {schema: SmsResponseOutputSchema},
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

  // 4. Generate the response using the AI
  let smsResponse = "Sorry, I'm having trouble connecting right now.";
  try {
    const { output } = await prompt({
      userMessage: input.userMessage,
      personaTraits: personaTraits,
      context: JSON.stringify(searchResult),
    });
    if (output?.smsResponse) {
      smsResponse = output.smsResponse;
    }
  } catch (error) {
    console.error('[handleInboundSms] Error generating SMS response:', error);
  }

  // If the AI generates an empty response, don't send anything back.
  if (!smsResponse || smsResponse.trim() === '') {
    console.log('Generated SMS response was empty, so no reply was sent.');
    return;
  }

  // 5. Send the AI's response back to the user via Twilio.
  try {
    const keysDocRef = db.doc(FIRESTORE_KEYS_PATH);
    const keysDocSnap = await keysDocRef.get();

    if (!keysDocSnap.exists) {
      throw new Error("Twilio configuration not found in Firestore.");
    }
    const { twilioAccountSid, twilioAuthToken, twilioPhoneNumber } = keysDocSnap.data()!;
    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      throw new Error("Incomplete Twilio credentials in Firestore.");
    }

    const client = twilio(twilioAccountSid, twilioAuthToken);
    await client.messages.create({
      body: smsResponse,
      from: twilioPhoneNumber,
      to: input.fromPhoneNumber,
    });
  } catch (error) {
    console.error('Failed to send outbound SMS:', error);
  }
}
