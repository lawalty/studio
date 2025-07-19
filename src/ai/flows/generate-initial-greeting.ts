'use server';
/**
 * @fileOverview A Genkit flow that generates a warm, inviting initial greeting.
 * It can optionally tailor the greeting to hint at the AI's knowledge base.
 */
import { z } from 'zod';
import { ai } from '@/ai/genkit';

// Zod schema for the input.
export const GenerateInitialGreetingInputSchema = z.object({
  personaTraits: z.string().describe("A summary of the AI's personality and character traits."),
  conversationalTopics: z.string().describe("A comma-separated list of topics the AI is an expert in. This may be used to tailor the greeting."),
  useKnowledgeInGreeting: z.boolean().describe("If true, the AI should try to subtly reference one of its knowledge topics. If false, it should provide a more generic, warm welcome."),
  language: z.string().optional().default('English').describe('The language for the greeting.'),
});
export type GenerateInitialGreetingInput = z.infer<typeof GenerateInitialGreetingInputSchema>;

// Zod schema for the output.
const GenerateInitialGreetingOutputSchema = z.object({
  greeting: z.string().describe("The AI's generated greeting message."),
});
export type GenerateInitialGreetingOutput = z.infer<typeof GenerateInitialGreetingOutputSchema>;


const generateInitialGreetingFlow = async ({
    personaTraits,
    conversationalTopics,
    useKnowledgeInGreeting,
    language,
}: GenerateInitialGreetingInput): Promise<GenerateInitialGreetingOutput> => {
    
    // Define the prompt with handlebars for conditional logic.
    const promptTemplate = `You are a conversational AI. Your persona is defined by these traits: "${personaTraits}".
Your goal is to provide a single, warm, and inviting opening greeting to start a conversation with a user.
The greeting must be in ${language}.

{{#if useKnowledgeInGreeting}}
You are an expert in the following topics: "${conversationalTopics}".
Your greeting should be welcoming and also subtly hint at one of these areas of expertise without being too direct. Keep it brief and natural.
{{else}}
Your greeting should be friendly and welcoming. Do not reference any specific knowledge or topics. Just say hello and invite the user to chat.
{{/if}}

Generate the greeting now. Do not include any preamble or extra text.
`;

    const response = await ai.generate({
        model: 'googleai/gemini-1.5-flash',
        prompt: promptTemplate,
        config: {
          temperature: 0.9, // Higher temperature for more creative/varied greetings
        },
        input: {
            useKnowledgeInGreeting,
        },
    });

    const greeting = response.text?.trim() ?? "Hello! How can I assist you today?";
    
    return { greeting };
};

// Export a wrapper function that can be called from the client.
export async function generateInitialGreeting(
  input: GenerateInitialGreetingInput
): Promise<GenerateInitialGreetingOutput> {
  return generateInitialGreetingFlow(input);
}
