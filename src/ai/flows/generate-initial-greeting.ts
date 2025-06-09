'use server';
/**
 * @fileOverview Generates an initial welcoming greeting for AI Blair.
 *
 * - generateInitialGreeting - A function that generates a greeting.
 * - GenerateInitialGreetingInput - The input type.
 * - GenerateInitialGreetingOutput - The return type.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateInitialGreetingInputSchema = z.object({
  personaTraits: z
    .string()
    .describe("The persona traits that define AI Blair's conversational style."),
});
export type GenerateInitialGreetingInput = z.infer<typeof GenerateInitialGreetingInputSchema>;

const GenerateInitialGreetingOutputSchema = z.object({
  greetingMessage: z.string().describe("AI Blair's generated initial greeting message."),
});
export type GenerateInitialGreetingOutput = z.infer<typeof GenerateInitialGreetingOutputSchema>;

export async function generateInitialGreeting(
  input: GenerateInitialGreetingInput
): Promise<GenerateInitialGreetingOutput> {
  return generateInitialGreetingFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateInitialGreetingPrompt',
  input: {schema: GenerateInitialGreetingInputSchema},
  output: {schema: GenerateInitialGreetingOutputSchema},
  prompt: `You are AI Blair. Your personality and style are defined by the following traits:
{{{personaTraits}}}

Generate a short, friendly, and inviting initial welcome message to start a conversation. For example: "Hello! I'm AI Blair. How can I assist you today?" or "Hi there! I'm AI Blair, ready to help with your questions."
Keep it concise and welcoming.
Your greeting:`,
});

const generateInitialGreetingFlow = ai.defineFlow(
  {
    name: 'generateInitialGreetingFlow',
    inputSchema: GenerateInitialGreetingInputSchema,
    outputSchema: GenerateInitialGreetingOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    return output!;
  }
);
