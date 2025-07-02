'use server';

/**
 * @fileOverview AI Persona and Personality Tuning flow.
 *
 * - adjustAiPersonaAndPersonality - Allows adjusting various traits and attributes for AI Blair's conversational style.
 * - AdjustAiPersonaAndPersonalityInput - The input type for the adjustAiPersonaAndPersonality function.
 * - AdjustAiPersonaAndPersonalityOutput - The return type for the adjustAiPersonaAndPersonality function.
 */

import {getGenkitAi} from '@/ai/genkit';
import {z} from 'genkit';

const AdjustAiPersonaAndPersonalityInputSchema = z.object({
  personaTraits: z
    .string()
    .describe(
      'A detailed description of the AI persona traits and attributes to be used in conversations.'
    ),
});
export type AdjustAiPersonaAndPersonalityInput = z.infer<
  typeof AdjustAiPersonaAndPersonalityInputSchema
>;

const AdjustAiPersonaAndPersonalityOutputSchema = z.object({
  updatedPersonaDescription: z
    .string()
    .describe(
      'A confirmation message from AI Blair, in its new character, indicating that its persona and personality have been successfully updated.'
    ),
});
export type AdjustAiPersonaAndPersonalityOutput = z.infer<
  typeof AdjustAiPersonaAndPersonalityOutputSchema
>;

export async function adjustAiPersonaAndPersonality(
  input: AdjustAiPersonaAndPersonalityInput
): Promise<AdjustAiPersonaAndPersonalityOutput> {
  const ai = await getGenkitAi();
  
  const adjustAiPersonaAndPersonalityFlow = ai.defineFlow(
    {
      name: 'adjustAiPersonaAndPersonalityFlow',
      inputSchema: AdjustAiPersonaAndPersonalityInputSchema,
      outputSchema: AdjustAiPersonaAndPersonalityOutputSchema,
    },
    async (flowInput) => {
      
      const prompt = ai.definePrompt({
        name: 'adjustAiPersonaAndPersonalityPrompt',
        model: 'googleai/gemini-1.5-flash',
        input: {schema: AdjustAiPersonaAndPersonalityInputSchema},
        output: {schema: AdjustAiPersonaAndPersonalityOutputSchema},
        prompt: `You are AI Blair. Your personality settings have just been updated with the following traits:
"{{{personaTraits}}}"

Please provide a concise and natural-sounding confirmation, in your new character as AI Blair, that your settings have been successfully applied. Do not list or repeat the persona traits in your response; simply confirm the update in character, reflecting this new personality. For example, if your new persona is very formal, your confirmation should be formal. If it's very friendly, be friendly.
Confirmation:`,
      });

      try {
        const {output} = await prompt(flowInput);
        if (!output || typeof output.updatedPersonaDescription !== 'string') {
          console.error('[adjustAiPersonaAndPersonalityFlow] Invalid or malformed output from prompt. Expected { updatedPersonaDescription: string }, received:', output);
          throw new Error('AI model returned an unexpected data-structure for persona confirmation.');
        }
        return output;
      } catch (e: any) {
         console.error('[adjustAiPersonaAndPersonalityFlow] Error during flow:', e);
         const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
         throw new Error(`The AI persona could not be updated. Details: ${errorMessage}`);
      }
    }
  );
  
  return adjustAiPersonaAndPersonalityFlow(input);
}
