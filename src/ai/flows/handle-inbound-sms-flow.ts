'use server';
/**
 * @fileOverview A dedicated flow to handle the entire lifecycle of an inbound SMS.
 * This flow isolates all server-side logic for receiving an SMS, generating a
 * response, and sending a reply, preventing build issues in the API route.
 *
 * - handleInboundSms - The main function to process the SMS.
 * - HandleInboundSmsInput - The input type for the function.
 */
import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { db } from '@/lib/firebase-admin';
import { generateSmsResponse } from './generate-sms-response';
import { sendSms } from './send-sms-flow';

const FIRESTORE_SITE_ASSETS_PATH = 'configurations/site_display_assets';
const DEFAULT_PERSONA_TRAITS = 'You are AI Blair, a helpful assistant.';

const HandleInboundSmsInputSchema = z.object({
  fromPhoneNumber: z.string(),
  userMessage: z.string(),
});
export type HandleInboundSmsInput = z.infer<typeof HandleInboundSmsInputSchema>;

export const handleInboundSms = ai.defineFlow(
  {
    name: 'handleInboundSmsFlow',
    inputSchema: HandleInboundSmsInputSchema,
    outputSchema: z.void(),
  },
  async ({ fromPhoneNumber, userMessage }) => {
    // 1. Fetch persona traits for the AI to use in its response.
    let personaTraits = DEFAULT_PERSONA_TRAITS;
    try {
      const docRef = db.doc(FIRESTORE_SITE_ASSETS_PATH);
      const docSnap = await docRef.get();
      if (docSnap.exists && docSnap.data()?.personaTraits) {
        personaTraits = docSnap.data()!.personaTraits;
      }
    } catch (e) {
      console.warn(
        'Could not fetch persona traits for SMS response, using default.',
        e
      );
    }

    // 2. Generate a concise, SMS-friendly response using the AI flow.
    const { smsResponse } = await generateSmsResponse({
      userMessage,
      personaTraits,
    });

    // If the AI generates an empty response, don't send anything back.
    if (!smsResponse || smsResponse.trim() === '') {
      console.log('Generated SMS response was empty, so no reply was sent.');
      return;
    }

    // 3. Send the AI's response back to the user via the Twilio SMS flow.
    const sendResult = await sendSms({
      toPhoneNumber: fromPhoneNumber,
      messageBody: smsResponse,
    });

    if (!sendResult.success) {
      // Log the error if the SMS fails to send.
      console.error(
        'Failed to send outbound SMS via flow:',
        sendResult.error
      );
    }
  }
);
