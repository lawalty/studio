
'use server';
/**
 * @fileOverview Generates a conversational response for AI Blair.
 *
 * - generateChatResponse - A function that generates a chat response.
 * - GenerateChatResponseInput - The input type for the generateChatResponse function.
 * - GenerateChatResponseOutput - The return type for the generateChatResponse function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Define a schema for individual chat messages for history
const ChatMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  parts: z.array(z.object({ text: z.string() })),
});

const KBContentSchema = z.object({
  summary: z.string().optional().describe('Summary of non-text files (e.g., PDF, DOC, audio).'),
  textContent: z.string().optional().describe('Full text content from .txt files.'),
});

const GenerateChatResponseInputSchema = z.object({
  userMessage: z.string().describe('The latest message from the user.'),
  knowledgeBaseHigh: KBContentSchema.describe(
    'High priority knowledge base content. This is the most recent and important information AI Blair has learned, typically from the last few interactions or critical updates.'
  ),
  knowledgeBaseMedium: KBContentSchema.describe(
    'Medium priority knowledge base content. This information was typically learned or updated 6 months to a year ago.'
  ),
  knowledgeBaseLow: KBContentSchema.describe(
    'Low priority knowledge base content. This is foundational or older information, learned over a year ago. It may include general handbooks or less frequently updated topics.'
  ),
  personaTraits: z
    .string()
    .describe("The persona traits that define AI Blair's conversational style."),
  chatHistory: z.array(ChatMessageSchema).describe('The history of the conversation so far.').optional(),
});
export type GenerateChatResponseInput = z.infer<typeof GenerateChatResponseInputSchema>;

const GenerateChatResponseOutputSchema = z.object({
  aiResponse: z.string().describe("AI Blair's generated response."),
});
export type GenerateChatResponseOutput = z.infer<typeof GenerateChatResponseOutputSchema>;

export async function generateChatResponse(
  input: GenerateChatResponseInput
): Promise<GenerateChatResponseOutput> {
  return generateChatResponseFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateChatResponsePrompt',
  input: {schema: GenerateChatResponseInputSchema},
  output: {schema: GenerateChatResponseOutputSchema},
  prompt: `You are AI Blair. Your personality and style are defined by the following traits:
{{{personaTraits}}}

You must answer user questions based on the following knowledge bases, ordered by priority. High Priority is the most recent and important, then Medium Priority, then Low Priority (foundational/older).

{{#if knowledgeBaseHigh.summary}}
High Priority File Summary (Most Recent - Learned Lately):
{{{knowledgeBaseHigh.summary}}}
{{/if}}
{{#if knowledgeBaseHigh.textContent}}
Extracted Content from High Priority .txt files (Most Recent - Learned Lately):
{{{knowledgeBaseHigh.textContent}}}
{{/if}}

{{#if knowledgeBaseMedium.summary}}
Medium Priority File Summary (Learned 6 months to a year ago):
{{{knowledgeBaseMedium.summary}}}
{{/if}}
{{#if knowledgeBaseMedium.textContent}}
Extracted Content from Medium Priority .txt files (Learned 6 months to a year ago):
{{{knowledgeBaseMedium.textContent}}}
{{/if}}

{{#if knowledgeBaseLow.summary}}
Low Priority File Summary (Foundational - Learned over a year ago):
{{{knowledgeBaseLow.summary}}}
{{/if}}
{{#if knowledgeBaseLow.textContent}}
Extracted Content from Low Priority .txt files (Foundational - Learned over a year ago, may include General Handbooks):
{{{knowledgeBaseLow.textContent}}}
{{/if}}

When answering:
- ALWAYS prioritize information from High Priority .txt files if relevant and available. If not found or not relevant, check Medium Priority .txt files, then Low Priority .txt files. You can quote or summarize directly from this text.
- If the answer is found in a higher priority KB's .txt files, you generally do not need to search lower priority KBs for the same information unless the user specifically asks for older/foundational details or context.
- For files mentioned in any File Summary (like PDFs, Word documents, audio files) that are *not* .txt files, you are aware of their existence and the topics they likely cover based on their names and their priority level (High, Medium, Low). State that you have information related to these topics and can discuss them generally according to their recency/priority. However, you cannot access their specific internal contents for direct quoting or detailed analysis. Politely inform the user of this limitation if they ask for very specific details from these non-.txt files.
- If the query cannot be answered from any part of the knowledge bases (including inferring from file names across all priority levels), politely state that you don't have information on that topic.

{{#if chatHistory.length}}
Conversation History:
{{#each chatHistory}}
{{#if this.isUser}}User: {{this.parts.[0].text}}{{/if}}
{{#if this.isModel}}AI Blair: {{this.parts.[0].text}}{{/if}}
{{/each}}
{{/if}}

Current user message: {{{userMessage}}}

Regarding greetings and addressing the user by name:
1.  Examine the 'Conversation History' provided above.
2.  If 'Conversation History' ALREADY CONTAINS ANY message starting with "AI Blair:":
    *   This means you (AI Blair) have spoken before. This is a follow-up response.
    *   If you address the user by name, use ONLY their name (e.g., "Bob, I can help..."). DO NOT use "Hi [User's Name]".
3.  If 'Conversation History' contains NO messages starting with "AI Blair:":
    *   This is your VERY FIRST utterance.
    *   If their \`Current user message\` includes their name (e.g., "My name is Bob"), greet with "Hi [User's Name]".
    *   Otherwise, provide a general, brief opening or proceed to answer.
4.  If the user's name is not known, do not guess. Focus on the query.

Generate a helpful and conversational response as AI Blair. After providing the main information, if natural for your persona and the conversation, ask a relevant follow-up question.
If the query cannot be answered from the knowledge base, state that and do not ask a follow-up question.
Keep responses concise and focused.
Your response:`,
});


const generateChatResponseFlow = ai.defineFlow(
  {
    name: 'generateChatResponseFlow',
    inputSchema: GenerateChatResponseInputSchema,
    outputSchema: GenerateChatResponseOutputSchema,
  },
  async (input) => {
    const processedChatHistory = (input.chatHistory || []).map(msg => ({
      ...msg,
      isUser: msg.role === 'user',
      isModel: msg.role === 'model',
    }));

    const promptInput = {
        userMessage: input.userMessage,
        knowledgeBaseHigh: input.knowledgeBaseHigh,
        knowledgeBaseMedium: input.knowledgeBaseMedium,
        knowledgeBaseLow: input.knowledgeBaseLow,
        personaTraits: input.personaTraits,
        chatHistory: processedChatHistory,
    };

    const {output} = await prompt(promptInput);
    return output!;
  }
);
