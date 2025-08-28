'use server';
import { z } from 'zod';
import { elevenLabsTextToSpeech } from './eleven-labs-tts-flow';
import { textToSpeech as googleTextToSpeech } from './text-to-speech-flow';
import { db as adminDb } from '@/lib/firebase-admin';

const GenerateHoldMessageInputSchema = z.object({
  language: z.string().optional().default('English'),
  useCustomTts: z.boolean(),
  ttsApiKey: z.string().optional(),
  ttsVoiceId: z.string().optional(),
});

const GenerateHoldMessageOutputSchema = z.object({
  text: z.string().optional(),
  audioDataUri: z.string().optional(),
  error: z.string().optional(),
});

type GenerateHoldMessageInput = z.infer<typeof GenerateHoldMessageInputSchema>;
type GenerateHoldMessageOutput = z.infer<typeof GenerateHoldMessageOutputSchema>;

const holdMessages: Record<string, string[]> = {
    English: [
      "Please hold on as I get the answer for you.",
      "Thanks for your patience, I’m looking that up now.",
      "Give me just a moment while I gather the details.",
      "Hang tight, I’m pulling that information for you.",
      "One sec—I want to make sure I get this right for you.",
      "I appreciate you waiting, I’ll have the answer shortly."
    ],
    Spanish: [
      "Por favor, espere mientras busco la respuesta para usted.",
      "Gracias por su paciencia, estoy buscando eso ahora.",
      "Deme un momento mientras reúno los detalles.",
      "Espere un instante, estoy obteniendo esa información para usted.",
      "Un segundo—quiero asegurarme de darle la respuesta correcta.",
      "Le agradezco que espere, tendré la respuesta en breve."
    ]
};

export async function generateHoldMessage({ 
    language = 'English',
    useCustomTts,
    ttsApiKey,
    ttsVoiceId,
}: GenerateHoldMessageInput): Promise<GenerateHoldMessageOutput> {
    try {
        const messages = holdMessages[language] || holdMessages['English'];
        const textToSpeak = messages[Math.floor(Math.random() * messages.length)];

        let audioDataUri = '';

        if (useCustomTts && ttsApiKey && ttsVoiceId) {
            const result = await elevenLabsTextToSpeech({ text: textToSpeak, apiKey: ttsApiKey, voiceId: ttsVoiceId });
            if (result.error || !result.media) {
                throw new Error(result.error || "Custom TTS service failed to return audio.");
            }
            audioDataUri = result.media;
        } else {
            const result = await googleTextToSpeech(textToSpeak);
            audioDataUri = result.media;
        }

        return { text: textToSpeak, audioDataUri };

    } catch (error: any) {
        console.error('[generateHoldMessage] Error:', error);
        return { error: error.message || 'An unknown error occurred while generating the hold message.' };
    }
}
