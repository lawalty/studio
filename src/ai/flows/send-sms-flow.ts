/**
 * @fileOverview A flow to send an SMS message using Twilio.
 *
 * - sendSms - A function that sends an SMS message.
 * - SendSmsInput - The input type for the function.
 * - SendSmsOutput - The return type for the function.
 */
'use server';
import { getGenkitAi } from '@/ai/genkit';
import { z } from 'genkit';
import { db } from '@/lib/firebase-admin';
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
  const ai = await getGenkitAi(); // AI instance not strictly needed here but good practice for consistency

  const sendSmsFlow = ai.defineFlow(
    {
      name: 'sendSmsFlow',
      inputSchema: SendSmsInputSchema,
      outputSchema: SendSmsOutputSchema,
    },
    async ({ toPhoneNumber, messageBody }) => {
      try {
        const docRef = db.doc(FIRESTORE_KEYS_PATH);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
          throw new Error("Twilio configuration not found in Firestore.");
        }

        const { twilioAccountSid, twilioAuthToken, twilioPhoneNumber } = docSnap.data()!;

        if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
          throw new Error("Incomplete Twilio credentials in Firestore. Please configure Account SID, Auth Token, and Phone Number.");
        }

        const client = twilio(twilioAccountSid, twilioAuthToken);

        const message = await client.messages.create({
          body: messageBody,
          from: twilioPhoneNumber,
          to: toPhoneNumber,
        });

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

  return sendSmsFlow(input);
}
