
'use server';

import { handleInboundSms } from '@/ai/flows/handle-inbound-sms-flow';
import { NextRequest } from 'next/server';

/**
 * Handles incoming SMS messages from Twilio by forwarding them to a Genkit flow.
 * @param request The incoming request from Twilio.
 * @returns A TwiML response to acknowledge receipt.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const fromPhoneNumber = params.get('From');
    const userMessage = params.get('Body');

    if (!fromPhoneNumber || !userMessage) {
      return new Response('Missing "From" or "Body" in the request payload.', {
        status: 400,
      });
    }

    // Offload all logic to the Genkit flow to avoid bundling issues.
    // This is an async call but we don't need to wait for it to finish
    // before responding to Twilio's webhook.
    handleInboundSms({ fromPhoneNumber, userMessage });

    // Respond to Twilio's webhook request with empty TwiML to acknowledge receipt.
    const twiml = '<Response></Response>';
    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
      status: 200,
    });
  } catch (error: any) {
    console.error('Critical error in SMS inbound webhook:', error);
    // In case of a major failure, return a server error.
    return new Response('Webhook processing failed.', { status: 500 });
  }
}
