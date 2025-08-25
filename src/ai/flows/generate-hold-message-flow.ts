
'use server';
import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { elevenLabsTextToSpeech } from './eleven-labs-tts-flow';
import { textToSpeech as googleTextToSpeech } from './text-to-speech-flow';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase-admin'; // Use firebase-admin on the server

const GenerateHoldMessageInputSchema = z.object({
  language: z.string().optional().default('English'),
});

const GenerateHoldMessageOutputSchema = z.object({
  audioDataUri: z.string().optional(),
  error: z.string().optional(),
});

type GenerateHoldMessageInput = z.infer<typeof GenerateHoldMessageInputSchema>;

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

// This is now a regular server function, not a flow, for simplicity.
export async function generateHoldMessage({ language = 'English' }: GenerateHoldMessageInput): Promise<z.infer<typeof GenerateHoldMessageOutputSchema>> {
    try {
        const messages = holdMessages[language] || holdMessages['English'];
        const textToSpeak = messages[Math.floor(Math.random() * messages.length)];

        // Fetch TTS config directly from Firestore on the server
        const appConfigDoc = await getDoc(doc(db, "configurations/app_config"));
        const ttsConfig = appConfigDoc.exists() ? appConfigDoc.data() : {};
        const useTtsApi = ttsConfig?.useTtsApi ?? false;
        const apiKey = ttsConfig?.tts ?? '';
        const voiceId = ttsConfig?.voiceId ?? '';

        let audioDataUri = '';

        if (useTtsApi && apiKey && voiceId) {
            const result = await elevenLabsTextToSpeech({ text: textToSpeak, apiKey, voiceId });
            if (result.error || !result.media) {
                throw new Error(result.error || "Custom TTS service failed to return audio.");
            }
            audioDataUri = result.media;
        } else {
            const result = await googleTextToSpeech(textToSpeak);
            audioDataUri = result.media;
        }

        return { audioDataUri };

    } catch (error: any) {
        console.error('[generateHoldMessage] Error:', error);
        return { error: error.message || 'An unknown error occurred while generating the hold message.' };
    }
}
