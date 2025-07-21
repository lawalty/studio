
'use server';

/**
 * @fileOverview AI Persona and Personality Tuning flow.
 *
 * - adjustAiPersonaAndPersonality - Allows adjusting various traits and attributes for IA Blair's conversational style.
 * - AdjustAiPersonaAndPersonalityInput - The input type for the adjustAiPersonaAndPersonality function.
 * - AdjustAiPersonaAndPersonalityOutput - The return type for the adjustAiPersonaAndPersonality function.
 */

import {z} from 'zod';
import { ai } from '@/ai/genkit'; // Ensures Genkit is configured
import { withRetry } from './index-document-flow';

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
      'A confirmation message from IA Blair, in its new character, indicating that its persona and personality have been successfully updated.'
    ),
});
export type AdjustAiPersonaAndPersonalityOutput = z.infer<
  typeof AdjustAiPersonaAndPersonalityOutputSchema
>;

const adjustAiPersonaAndPersonalityFlow = async (flowInput: AdjustAiPersonaAndPersonalityInput): Promise<AdjustAiPersonaAndPersonalityOutput> => {
    
    const prompt = ai.definePrompt({
      name: 'adjustAiPersonaAndPersonalityPrompt',
      input: {schema: AdjustAiPersonaAndPersonalityInputSchema},
      output: {schema: AdjustAiPersonaAndPersonalityOutputSchema},
      prompt: `You are IA Blair. Your personality settings have just been updated with the following traits:
"{{{personaTraits}}}"

Please provide a concise and natural-sounding confirmation, in your new character as IA Blair, that your settings have been successfully applied. Do not list or repeat the persona traits in your response; simply confirm the update in character, reflecting this new personality. For example, if your new persona is very formal, your confirmation should be formal. If it's very friendly, be friendly.
Confirmation:`,
    });

    try {
      const response = await withRetry(() => prompt(flowInput, { model: 'googleai/gemini-1.5-flash' }));
      const output = response.output;

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
  };
  
export async function adjustAiPersonaAndPersonality(
  input: AdjustAiPersonaAndPersonalityInput
): Promise<AdjustAiPersonaAndPersonalityOutput> {
  return adjustAiPersonaAndPersonalityFlow(input);
}
