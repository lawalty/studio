'use server';
/**
 * @fileOverview A flow to translate text from English to a specified target language.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';

const TranslateTextInputSchema = z.object({
  text: z.string().describe('The English text to be translated.'),
  targetLanguage: z.string().describe('The language to translate the text into.'),
});
export type TranslateTextInput = z.infer<typeof TranslateTextInputSchema>;

const TranslateTextOutputSchema = z.object({
  translatedText: z.string().describe('The resulting translated text.'),
});
export type TranslateTextOutput = z.infer<typeof TranslateTextOutputSchema>;


const translateTextFlow = ai.defineFlow(
  {
    name: 'translateTextFlow',
    inputSchema: TranslateTextInputSchema,
    outputSchema: TranslateTextOutputSchema,
  },
  async ({ text, targetLanguage }) => {
    try {
      const prompt = `You are an expert translator. Translate the following English text to ${targetLanguage}.
      - The target dialect is for Mexico City.
      - Provide only the translated text.
      - Do not add any commentary, preamble, explanation, or summary.
      - Do not wrap the output in code blocks or JSON formatting.
      - Your final output should only be the clean, translated text, ready for display.
      
      Text to translate: "${text}"`;

      const { text: translatedText } = await ai.generate({
        model: 'googleai/gemini-1.5-flash',
        prompt: prompt,
        config: {
          temperature: 0.2,
        },
      });

      return { translatedText: translatedText.trim() };
      
    } catch (e: any) {
      console.error('[translateTextFlow] A critical error occurred:', e);
      const rawError = e instanceof Error ? e.message : JSON.stringify(e);
      let detailedError: string;
      
      if (rawError.includes("Could not refresh access token") || rawError.includes("500")) {
          detailedError = `CRITICAL: Translation failed due to a Google Cloud configuration issue. Please check your API Key, ensure the Vertex AI API is enabled, and that billing is active for your project.`;
      } else if (rawError.includes('permission denied') || rawError.includes('IAM')) {
          detailedError = `Translation failed due to a permissions issue. Please check the service account's IAM roles.`;
      } else {
          detailedError = `Translation failed. This may be due to a temporary network issue or an API configuration problem. Please check your Google AI API key and try again.`;
      }
      
      throw new Error(detailedError);
    }
  }
);

export async function translateText(
  input: TranslateTextInput
): Promise<TranslateTextOutput> {
  return translateTextFlow(input);
}
