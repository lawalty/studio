
'use server';
/**
 * @fileOverview A flow to convert text to speech using a Genkit-configured model.
 *
 * - textToSpeech - Converts a string of text into a base64 encoded WAV audio data URI.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import wav from 'wav';
import { googleAI } from '@genkit-ai/googleai';

// Helper function to convert raw PCM audio data from the model into a WAV file format,
// then encode it as a Base64 string for easy use in data URIs.
async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    const bufs: any[] = [];
    writer.on('error', reject);
    writer.on('data', function (d) {
      bufs.push(d);
    });
    writer.on('end', function () {
      resolve(Buffer.concat(bufs).toString('base64'));
    });

    writer.write(pcmData);
    writer.end();
  });
}

// Define the schema for the flow's input and output.
const TextToSpeechInputSchema = z.string();
const TextToSpeechOutputSchema = z.object({
  media: z.string().describe('The generated audio as a data URI string in WAV format.'),
});

// Define the Genkit flow. This is an internal function and is not exported.
const textToSpeechFlow = ai.defineFlow(
  {
    name: 'textToSpeechFlow',
    inputSchema: TextToSpeechInputSchema,
    outputSchema: TextToSpeechOutputSchema,
  },
  async (query: string) => {
    const { media } = await ai.generate({
      model: googleAI.model('gemini-2.5-flash-preview-tts'),
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Algenib' },
          },
        },
      },
      prompt: query,
    });
    if (!media) {
      throw new Error('No media was returned from the text-to-speech service.');
    }
    // The model returns raw PCM data; we need to convert it to a usable format like WAV.
    const audioBuffer = Buffer.from(
      media.url.substring(media.url.indexOf(',') + 1),
      'base64'
    );
    return {
      media: 'data:audio/wav;base64,' + (await toWav(audioBuffer)),
    };
  }
);

/**
 * The public-facing async function that can be safely imported by client components.
 * It takes a string as input and returns the result from the flow.
 */
export async function textToSpeech(text: string): Promise<{ media: string }> {
  return textToSpeechFlow(text);
}
