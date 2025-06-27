
'use server';
/**
 * @fileOverview A flow to send an SMS message using Twilio.
 *
 * - sendSms - A function that sends an SMS message.
 * - SendSmsInput - The input type for the function.
 * - SendSmsOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getFirestore } from 'firebase-admin/firestore';
import twilio from 'twilio';

const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";

const SendSmsInputSchema = z.object({
  toPhoneNumber: z.string().describe('The recipient\'s phone number in E.164 format (e.g., +15551234567).'),
  messageBody: z.string().describe('The content of the SMS message to send.'),
});
export type SendSmsInput = z.infer<typeof SendSmsInputSchema>;

const SendSmsOutputSchema = z.object({
  success: z.boolean().describe('Whether the SMS was successfully sent.'),
  messageSid: z.string().optional().describe('The unique SID of the message from Twilio.'),
  error: z.string().optional().describe('An error message if the sending failed.'),
});
export type SendSmsOutput = z.infer<typeof SendSmsOutputSchema>;

export async function sendSms(input: SendSmsInput): Promise<SendSmsOutput> {
  return sendSmsFlow(input);
}

const sendSmsFlow = ai.defineFlow(
  {
    name: 'sendSmsFlow',
    inputSchema: SendSmsInputSchema,
    outputSchema: SendSmsOutputSchema,
  },
  async ({ toPhoneNumber, messageBody }) => {
    // The Genkit firebase() plugin handles initialization. Manual init is no longer needed.
    
    try {
      // Get Firestore instance.
      const db = getFirestore();

      // 1. Fetch Twilio credentials from Firestore using Admin SDK
      const docRef = db.doc(FIRESTORE_KEYS_PATH);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        throw new Error("Twilio configuration not found in Firestore.");
      }

      const { twilioAccountSid, twilioAuthToken, twilioPhoneNumber } = docSnap.data()!;

      if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
        throw new Error("Incomplete Twilio credentials in Firestore. Please configure Account SID, Auth Token, and Phone Number.");
      }

      // 2. Initialize Twilio client
      const client = twilio(twilioAccountSid, twilioAuthToken);

      // 3. Send the message
      const message = await client.messages.create({
        body: messageBody,
        from: twilioPhoneNumber,
        to: toPhoneNumber,
      });

      // 4. Return success response
      return {
        success: true,
        messageSid: message.sid,
      };
    } catch (error: any) {
      console.error("[sendSmsFlow] Error sending SMS:", error);
      return {
        success: false,
        error: error.message || 'An unknown error occurred while sending the SMS.',
      };
    }
  }
);
