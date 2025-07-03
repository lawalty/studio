'use server';
/**
 * @fileOverview A flow to translate text from English to a specified target language.
 */
import { getGenkitAi } from '@/ai/genkit';
import { z } from 'genkit';

export const TranslateTextInputSchema = z.object({
  text: z.string().describe('The English text to be translated.'),
  targetLanguage: z.string().describe('The language to translate the text into.'),
});
export type TranslateTextInput = z.infer<typeof TranslateTextInputSchema>;

export const TranslateTextOutputSchema = z.object({
  translatedText: z.string().describe('The resulting translated text.'),
});
export type TranslateTextOutput = z.infer<typeof TranslateTextOutputSchema>;

export async function translateText(
  input: TranslateTextInput
): Promise<TranslateTextOutput> {
  const ai = await getGenkitAi();

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
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred during translation.';
        throw new Error(`Translation failed. Full technical error: ${errorMessage}`);
      }
    }
  );

  return translateTextFlow(input);
}
