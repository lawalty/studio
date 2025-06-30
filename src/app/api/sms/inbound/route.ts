
'use server';

import { NextRequest } from 'next/server';

/**
 * Handles incoming SMS messages from Twilio.
 * This route is temporarily disabled for deployment diagnostics.
 * @param request The incoming request from Twilio.
 * @returns A TwiML response to acknowledge receipt.
 */
export async function POST(request: NextRequest) {
  console.log("SMS inbound route called, but is temporarily disabled for diagnostics.");
  
  // Respond to Twilio's webhook request with empty TwiML to prevent errors on their end.
  // This acknowledges receipt and tells Twilio we've handled the message.
  const twiml = '<Response></Response>';
  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml' },
    status: 200,
  });
}
