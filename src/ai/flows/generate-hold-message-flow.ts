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
        "Of course, one moment.",
        "Good question, let me check on that for you.",
        "Just a second while I pull that up.",
        "Let me see... just a moment.",
    ],
    Spanish: [
        "Claro, un momento.",
        "Buena pregunta, déjame revisarlo.",
        "Solo un segundo mientras lo busco.",
        "Déjame ver... un momento.",
    ],
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
