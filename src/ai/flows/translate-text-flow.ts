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
      
      if (rawError.includes("Could not refresh access token")) {
          detailedError = `Translation failed due to a local authentication error. The server running on your machine could not authenticate with Google Cloud services. Please run 'gcloud auth application-default login' in your terminal and restart the dev server. See README.md for details.`;
      } else if (rawError.includes("API key not valid")) {
          detailedError = "Translation failed: The provided Google AI API Key is invalid. Please verify it in your .env.local file or hosting provider's secret manager.";
      } else if (rawError.includes('permission denied') || rawError.includes('IAM')) {
          detailedError = `Translation failed due to a permissions issue. Ensure the 'Vertex AI API' is enabled in your Google Cloud project and your account has the correct permissions.`;
      } else if (rawError.includes("PROJECT_BILLING_NOT_ENABLED")) {
          detailedError = `Translation failed because billing is not enabled for your Google Cloud project. Please enable it in the Google Cloud Console.`;
      } else {
          detailedError = `Translation failed for an unexpected reason. This is often caused by a configuration issue. Full error: ${rawError}`;
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
