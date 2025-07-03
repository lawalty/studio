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
          detailedError = `CRITICAL: Translation failed with a Google Cloud internal error, likely due to a project configuration issue. Please check the following: 1) Propagation Time: If you just enabled billing or APIs, it can take 5-10 minutes to activate. Please try again in a few minutes. 2) API Key: Ensure the Google AI API Key saved in the admin panel is correct. 3) API Status: Double-check that the 'Vertex AI API' is enabled in the Google Cloud Console for this project. Full error: ${rawError}`;
      } else if (rawError.includes('permission denied') || rawError.includes('IAM')) {
          detailedError = `Translation failed due to a permissions issue. Please check that the App Hosting service account has the required IAM roles (e.g., Vertex AI User). Full error: ${rawError}`;
      } else {
          detailedError = `Translation failed. Full technical error: ${rawError}`;
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
