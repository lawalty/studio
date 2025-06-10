
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

const GenerateChatResponseInputSchema = z.object({
  userMessage: z.string().describe('The latest message from the user.'),
  knowledgeBaseContent: z
    .string()
    .describe('The combined knowledge base content AI Blair should use. This includes general information, a summary of uploaded files (like PDFs, Word docs, audio files), and the full text content of any .txt files.'),
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

You must answer user questions based on the following knowledge base content. This content is structured:
1.  General information.
2.  A "File Summary" listing uploaded documents (e.g., PDFs, Word files, audio files) that are part of your knowledge.
3.  "Extracted Content from .txt files" which contains the full text from any .txt documents.

<knowledge_base>
{{{knowledgeBaseContent}}}
</knowledge_base>

When answering:
- Prioritize information from "Extracted Content from .txt files" if it's relevant to the user's query. You can quote or summarize directly from this text.
- For files mentioned in the "File Summary" (like PDFs, Word documents, audio files) that are *not* .txt files, you are aware of their existence and the topics they likely cover (based on their names). State that you have information related to these topics and can discuss them generally. However, in this version, you cannot access their specific internal contents for direct quoting or detailed analysis. Politely inform the user of this limitation if they ask for very specific details from these non-.txt files.
- If the query cannot be answered from any part of the knowledge base (including inferring from file names), politely state that you don't have information on that topic.

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
        knowledgeBaseContent: input.knowledgeBaseContent,
        personaTraits: input.personaTraits,
        chatHistory: processedChatHistory,
    };

    const {output} = await prompt(promptInput);
    return output!;
  }
);

