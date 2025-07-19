'use server';
/**
 * @fileOverview A flow to convert text to speech using the ElevenLabs API.
 *
 * - elevenLabsTextToSpeech - Converts text to speech using a specified voice ID and API key.
 * - ElevenLabsTextToSpeechInput - The input type for the function.
 */
import { z } from 'zod';
import { ai } from '@/ai/genkit';

const ElevenLabsTextToSpeechInputSchema = z.object({
  text: z.string().describe('The text to be converted to speech.'),
  voiceId: z.string().describe('The ElevenLabs voice ID to use for the synthesis.'),
  apiKey: z.string().describe('The ElevenLabs API key for authentication.'),
});
export type ElevenLabsTextToSpeechInput = z.infer<typeof ElevenLabsTextToSpeechInputSchema>;

const ElevenLabsTextToSpeechOutputSchema = z.object({
  media: z.string().describe('The generated audio as a Base64 data URI string.'),
  error: z.string().optional().describe('An error message if the operation failed.'),
});

const elevenLabsTextToSpeechFlow = ai.defineFlow(
  {
    name: 'elevenLabsTextToSpeechFlow',
    inputSchema: ElevenLabsTextToSpeechInputSchema,
    outputSchema: ElevenLabsTextToSpeechOutputSchema,
  },
  async ({ text, voiceId, apiKey }) => {
    const ELEVENLABS_API_URL = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    try {
      const response = await fetch(ELEVENLABS_API_URL, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2', // Or another suitable model
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(`ElevenLabs API Error: ${response.status} ${response.statusText} - ${errorBody.detail?.message || 'Unknown error'}`);
      }

      const audioBlob = await response.blob();
      const buffer = Buffer.from(await audioBlob.arrayBuffer());
      const base64Audio = buffer.toString('base64');
      
      return {
        media: `data:${audioBlob.type};base64,${base64Audio}`
      };

    } catch (error: any) {
      console.error('[elevenLabsTextToSpeechFlow] Error:', error);
      return { 
        media: '',
        error: `Failed to synthesize speech with ElevenLabs. ${error.message}` 
      };
    }
  }
);

/**
 * The public-facing async function that can be safely imported by client components.
 */
export async function elevenLabsTextToSpeech(input: ElevenLabsTextToSpeechInput): Promise<{ media: string; error?: string; }> {
  return elevenLabsTextToSpeechFlow(input);
}
