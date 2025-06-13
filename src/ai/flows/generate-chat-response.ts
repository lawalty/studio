
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
  summary: z.string().optional().describe('Summary of non-text/non-PDF files (e.g., DOC, audio).'),
  textContent: z.string().optional().describe('Full text content from .txt files and extracted from PDF files.'),
});

const GenerateChatResponseInputSchema = z.object({
  userMessage: z.string().describe('The latest message from the user.'),
  knowledgeBaseHigh: KBContentSchema.describe(
    'High priority knowledge base content. This is the most recent and important information AI Blair has learned. Includes .txt content and extracted PDF text.'
  ),
  knowledgeBaseMedium: KBContentSchema.describe(
    'Medium priority knowledge base content. This information was typically learned or updated 6 months to a year ago. Includes .txt content and extracted PDF text.'
  ),
  knowledgeBaseLow: KBContentSchema.describe(
    'Low priority knowledge base content. This is foundational or older information, learned over a year ago. It may include general handbooks or less frequently updated topics. Includes .txt content and extracted PDF text.'
  ),
  personaTraits: z
    .string()
    .describe("The persona traits that define AI Blair's conversational style."),
  chatHistory: z.array(ChatMessageSchema).describe('The history of the conversation so far.').optional(),
});
export type GenerateChatResponseInput = z.infer<typeof GenerateChatResponseInputSchema>;

const GenerateChatResponseOutputSchema = z.object({
  aiResponse: z.string().describe("AI Blair's generated response."),
  shouldEndConversation: z.boolean().optional().describe("True if the AI detected the user wants to end the conversation and has provided a closing remark. This signals the client that the session can be concluded.")
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

Your goal is to provide a clear, conversational, and helpful answer to the user's question.
Use the information provided below. This information is prioritized: information listed under "Recent & Important Details" should be preferred. If the answer is found there, you generally don't need to consult "Supporting Information" or "Foundational or Older Information" unless necessary for full context or if the user asks for historical/less recent details.

Synthesize the information seamlessly into your response. DO NOT mention specific file names, and DO NOT explicitly state that you are retrieving information (e.g., avoid phrases like "According to the document..." or "I found this in..."). Make it sound like you inherently know this information.

If the available information (across all priority levels) doesn't sufficiently answer the question, you should indicate this naturally. For example, you could say something like, "I don't seem to recall that specific detail right now," or "Hmm, that particular piece of information isn't in my current memory." Do not invent answers. If you state you don't have the information, do not ask a follow-up question in this turn.

Available Information:

Recent & Important Details (Primarily use this if relevant and textContent is available):
{{#if knowledgeBaseHigh.textContent}}
{{{knowledgeBaseHigh.textContent}}}
{{/if}}
{{#if knowledgeBaseHigh.summary}}
General topics recently covered (You are aware these topics exist from file names/types, but for detailed content, prioritize any textContent above or in other sections. Only refer to these summary points if no specific textContent answers the query):
{{{knowledgeBaseHigh.summary}}}
{{/if}}

Supporting Information (Consult if needed and textContent is available):
{{#if knowledgeBaseMedium.textContent}}
{{{knowledgeBaseMedium.textContent}}}
{{/if}}
{{#if knowledgeBaseMedium.summary}}
General topics covered some time ago (Awareness of topics, prioritize textContent):
{{{knowledgeBaseMedium.summary}}}
{{/if}}

Foundational or Older Information (Consult as a last resort, for historical context, or if textContent is available):
{{#if knowledgeBaseLow.textContent}}
{{{knowledgeBaseLow.textContent}}}
{{/if}}
{{#if knowledgeBaseLow.summary}}
General foundational topics (Awareness of topics, prioritize textContent):
{{{knowledgeBaseLow.summary}}}
{{/if}}

If a user asks for very specific details from files like Word documents or audio files (which would only be implied by the "General topics" sections above if no corresponding textContent was provided), and you have no specific textContent to draw from, politely inform them you're aware of the topic the file likely covers but can't access its specific internal content for direct quoting, using natural phrasing like "I recall that topic, but the specific details aren't immediately available to me right now."

{{#if chatHistory.length}}
Previous turn(s) in this conversation:
{{#each chatHistory}}
{{#if this.isUser}}User: {{this.parts.[0].text}}{{/if}}
{{#if this.isModel}}AI Blair: {{this.parts.[0].text}}{{/if}}
{{/each}}
{{/if}}

Current user message: {{{userMessage}}}

Regarding greetings and addressing the user by name:
1.  Examine the 'Previous turn(s) in this conversation' provided above.
2.  If it ALREADY CONTAINS ANY message starting with "AI Blair:":
    *   This means you (AI Blair) have spoken before. This is a follow-up response.
    *   If you address the user by name, use ONLY their name (e.g., "Bob, I can help..."). DO NOT use "Hi [User's Name]" or "Hello [User's Name]".
3.  If 'Previous turn(s) in this conversation' contains NO messages starting with "AI Blair:":
    *   This is your VERY FIRST utterance in this conversation (excluding any initial automated greeting from a separate system).
    *   If the user's \`Current user message\` seems to introduce their name (e.g., "My name is Bob", "I'm Bob", "Call me Bob"), you MAY greet them with "Hi [User's Name]" or "Hello [User's Name]" as part of your response.
    *   Otherwise (if it's your first response to them and they haven't stated their name in the current message), provide a general, brief opening or proceed directly to answer.
4.  If the user's name is not known from the conversation, do not guess or ask for it here.

Special instructions for ending the conversation:
If the user's 'Current user message' clearly expresses a desire to end the chat (e.g., "goodbye", "that's all for now", "I'm done", "end the conversation", "no more questions", "thank you, that's it", "stop"), your 'aiResponse' should be a polite closing remark (e.g., "You're welcome! It was nice talking to you. Goodbye!", "Alright, thanks for chatting with me today!", "Okay, have a great day!").
In this specific scenario, you MUST also set the 'shouldEndConversation' field in your output to true.
Crucially, if you are ending the conversation, DO NOT ask any follow-up questions, even if your persona would normally do so.

Unless you are ending the conversation (as per the 'Special instructions for ending the conversation' above) OR if you stated you don't have the information for the user's query, after providing the main answer, try to ask a relevant follow-up question to naturally continue the conversation, if appropriate for your persona.

Your Conversational Answer as AI Blair:`,
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

    