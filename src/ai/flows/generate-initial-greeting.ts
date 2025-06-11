
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
  knowledgeBaseHighSummary: z
    .string()
    .optional()
    .describe(
      'Summary of non-text files from the High Priority Knowledge Base (most recent topics AI Blair has learned).'
    ),
  knowledgeBaseHighTextContent: z
    .string()
    .optional()
    .describe(
      'Full text content from .txt files in the High Priority Knowledge Base (most recent topics AI Blair has learned).'
    ),
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

{{#if knowledgeBaseHighSummary}}
You have recently learned about these topics (from High Priority non-text files):
{{{knowledgeBaseHighSummary}}}
{{/if}}
{{#if knowledgeBaseHighTextContent}}
You have recently learned this specific information (from High Priority .txt files):
{{{knowledgeBaseHighTextContent}}}
{{/if}}

Generate a short, friendly, and inviting initial welcome message to start a conversation.
- Your greeting should be warm and welcoming.
- Try to make your greeting varied and not always the same.
- Subtly tailor your greeting to reflect the topics you've recently learned from the High Priority Knowledge Base, if applicable and natural.
- If it feels natural for your persona and the context you are setting, you may also choose to politely ask for the user's name. However, do not do this every time.

Examples (adapt these based on your persona and recent knowledge):
"Hello! I'm AI Blair. I've just been updated on [mention a topic from High KB if relevant]. How can I assist you today?"
"Hi there! I'm AI Blair, ready to help. I was just reviewing some information about [High KB topic]. What's on your mind? And, if you'd like, what's your name?"
"Welcome! I'm AI Blair. What can I do for you? By the way, you can call me AI Blair, and you are?"

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

