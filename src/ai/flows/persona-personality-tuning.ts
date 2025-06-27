
'use server';

/**
 * @fileOverview AI Persona and Personality Tuning flow.
 *
 * - adjustAiPersonaAndPersonality - Allows adjusting various traits and attributes for AI Blair's conversational style.
 * - AdjustAiPersonaAndPersonalityInput - The input type for the adjustAiPersonaAndPersonality function.
 * - AdjustAiPersonaAndPersonalityOutput - The return type for the adjustAiPersonaAndPersonality function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { gemini15Flash } from '@genkit-ai/googleai';

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
  return adjustAiPersonaAndPersonalityFlow(input);
}

const adjustAiPersonaAndPersonalityFlow = ai.defineFlow(
  {
    name: 'adjustAiPersonaAndPersonalityFlow',
    inputSchema: AdjustAiPersonaAndPersonalityInputSchema,
    outputSchema: AdjustAiPersonaAndPersonalityOutputSchema,
  },
  async input => {
    // The AI model is now pre-configured in genkit.ts to use the environment variable.
    const model = gemini15Flash;
    
    const prompt = ai.definePrompt({
      name: 'adjustAiPersonaAndPersonalityPrompt',
      model: model,
      input: {schema: AdjustAiPersonaAndPersonalityInputSchema},
      output: {schema: AdjustAiPersonaAndPersonalityOutputSchema},
      prompt: `You are AI Blair. Your personality settings have just been updated with the following traits:
"{{{personaTraits}}}"

Please provide a concise and natural-sounding confirmation, in your new character as AI Blair, that your settings have been successfully applied. Do not list or repeat the persona traits in your response; simply confirm the update in character, reflecting this new personality. For example, if your new persona is very formal, your confirmation should be formal. If it's very friendly, be friendly.
Confirmation:`,
    });

    try {
      const {output} = await prompt(input);
      if (!output || typeof output.updatedPersonaDescription !== 'string') {
        console.error('[adjustAiPersonaAndPersonalityFlow] Invalid or malformed output from prompt. Expected { updatedPersonaDescription: string }, received:', output);
        throw new Error('AI model returned an unexpected data-structure for persona confirmation.');
      }
      return output;
    } catch (e: any) {
       console.error('[adjustAiPersonaAndPersonalityFlow] Error during flow:', e);
       throw new Error(`The AI persona could not be updated. This may be due to an invalid GOOGLE_AI_API_KEY. Original error: ${e.message}`);
    }
  }
);
