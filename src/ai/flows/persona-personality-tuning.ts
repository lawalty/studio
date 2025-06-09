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
      'A confirmation message indicating that the AI persona and personality have been successfully updated.'
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

const prompt = ai.definePrompt({
  name: 'adjustAiPersonaAndPersonalityPrompt',
  input: {schema: AdjustAiPersonaAndPersonalityInputSchema},
  output: {schema: AdjustAiPersonaAndPersonalityOutputSchema},
  prompt: `You are an AI personality tuner. Please review the following persona traits and attributes and confirm that they have been successfully updated.\n\nPersona Traits: {{{personaTraits}}}`,
});

const adjustAiPersonaAndPersonalityFlow = ai.defineFlow(
  {
    name: 'adjustAiPersonaAndPersonalityFlow',
    inputSchema: AdjustAiPersonaAndPersonalityInputSchema,
    outputSchema: AdjustAiPersonaAndPersonalityOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
