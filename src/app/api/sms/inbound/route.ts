
'use server';

import { NextRequest } from 'next/server';
import { generateSmsResponse } from '@/ai/flows/generate-sms-response';
import { sendSms } from '@/ai/flows/send-sms-flow';
import { db } from '@/lib/firebase-admin';

const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const DEFAULT_PERSONA_TRAITS = "You are AI Blair, a helpful assistant.";

/**
 * Handles incoming SMS messages from Twilio.
 * @param request The incoming request from Twilio.
 * @returns A TwiML response to acknowledge receipt.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const fromPhoneNumber = formData.get('From') as string;
    const userMessage = formData.get('Body') as string;

    if (!fromPhoneNumber || !userMessage) {
      return new Response('Missing "From" or "Body" in the request payload.', { status: 400 });
    }

    // 1. Fetch persona traits for the AI to use in its response.
    let personaTraits = DEFAULT_PERSONA_TRAITS;
    try {
        const docRef = db.doc(FIRESTORE_SITE_ASSETS_PATH);
        const docSnap = await docRef.get();
        if (docSnap.exists && docSnap.data()?.personaTraits) {
            personaTraits = docSnap.data()!.personaTraits;
        }
    } catch (e) {
        console.warn("Could not fetch persona traits for SMS response, using default.", e);
    }
    
    // 2. Generate a concise, SMS-friendly response using the AI flow.
    const { smsResponse } = await generateSmsResponse({
      userMessage,
      personaTraits,
    });

    // If the AI generates an empty response, don't send anything back.
    if (!smsResponse || smsResponse.trim() === '') {
        console.log("Generated SMS response was empty, so no reply was sent.");
    } else {
       // 3. Send the AI's response back to the user via the Twilio SMS flow.
        const sendResult = await sendSms({
            toPhoneNumber: fromPhoneNumber,
            messageBody: smsResponse,
        });

        if (!sendResult.success) {
            // Log the error if the SMS fails to send, but don't crash the webhook.
            console.error("Failed to send outbound SMS via flow:", sendResult.error);
        }
    }

    // 4. Respond to Twilio's webhook request with empty TwiML.
    // This acknowledges receipt and tells Twilio we've handled the message.
    const twiml = '<Response></Response>';
    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
      status: 200,
    });

  } catch (error: any) {
    console.error("Critical error in SMS inbound webhook:", error);
    // In case of a major failure, return a server error.
    return new Response('Webhook processing failed.', { status: 500 });
  }
}
