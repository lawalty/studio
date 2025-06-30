
'use server';

import { NextRequest } from 'next/server';
// import { generateSmsResponse } from '@/ai/flows/generate-sms-response';
// import { sendSms } from '@/ai/flows/send-sms-flow';
import * as admin from 'firebase-admin';

// const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
// const DEFAULT_PERSONA_TRAITS = "You are AI Blair, a helpful assistant.";

/**
 * Handles incoming SMS messages from Twilio.
 * @param request The incoming request from Twilio.
 * @returns A TwiML response to acknowledge receipt.
 */
export async function POST(request: NextRequest) {
  try {
    // Logic has been temporarily disabled to diagnose a container startup issue.
    // A successful deployment will confirm the issue is within the Genkit flows.
    // We can then re-enable this logic.

    // const formData = await request.formData();
    // const fromPhoneNumber = formData.get('From') as string;
    // const userMessage = formData.get('Body') as string;

    // if (!fromPhoneNumber || !userMessage) {
    //   return new Response('Missing "From" or "Body" in the request payload.', { status: 400 });
    // }

    // let personaTraits = DEFAULT_PERSONA_TRAITS;
    // try {
    //     if (admin.apps.length === 0) {
    //       admin.initializeApp();
    //     }
    //     const db = admin.firestore();
    //     const docRef = db.doc(FIRESTORE_SITE_ASSETS_PATH);
    //     const docSnap = await docRef.get();
    //     if (docSnap.exists && docSnap.data()?.personaTraits) {
    //         personaTraits = docSnap.data()!.personaTraits;
    //     }
    // } catch (e) {
    //     console.warn("Could not fetch persona traits for SMS response, using default.", e);
    // }
    
    // const { smsResponse } = await generateSmsResponse({
    //   userMessage,
    //   personaTraits,
    // });

    // if (!smsResponse || smsResponse.trim() === '') {
    //     console.log("Generated SMS response was empty, so no reply was sent.");
    // } else {
    //    const sendResult = await sendSms({
    //         toPhoneNumber: fromPhoneNumber,
    //         messageBody: smsResponse,
    //     });

    //     if (!sendResult.success) {
    //         console.error("Failed to send outbound SMS via flow:", sendResult.error);
    //     }
    // }

    const twiml = '<Response></Response>';
    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
      status: 200,
    });

  } catch (error: any) {
    console.error("Critical error in SMS inbound webhook:", error);
    return new Response('Webhook processing failed.', { status: 500 });
  }
}
