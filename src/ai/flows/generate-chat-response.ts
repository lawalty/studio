'use server';
/**
 * @fileOverview Generates a conversational response for AI Blair using a tool-based RAG agent.
 *
 * - generateChatResponse - A function that generates a chat response.
 * - GenerateChatResponseInput - The input type for the function.
 * - GenerateChatResponseOutput - The return type for the function.
 */

import { getGenkitAi } from '@/ai/genkit';
import { z } from 'genkit';
import { knowledgeBaseSearchTool } from '../tools/knowledge-base-tool';

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  parts: z.array(z.object({ text: z.string() })),
});

const GenerateChatResponseInputSchema = z.object({
  userMessage: z.string().describe('The latest message from the user.'),
  personaTraits: z
    .string()
    .describe("The persona traits that define AI Blair's conversational style."),
  conversationalTopics: z
    .string()
    .optional()
    .describe('A list of topics the AI should consider its area of expertise.'),
  chatHistory: z.array(ChatMessageSchema).describe('The history of the conversation so far.').optional(),
});
export type GenerateChatResponseInput = z.infer<typeof GenerateChatResponseInputSchema>;

const PdfSourceReferenceSchema = z.object({
  fileName: z.string().describe('The name of the PDF file being referenced.'),
  downloadURL: z.string().url().describe('The public download URL for the PDF file.'),
});

const GenerateChatResponseOutputSchema = z.object({
  aiResponse: z.string().describe("AI Blair's generated response."),
  shouldEndConversation: z.boolean().optional().describe("True if the AI detected the user wants to end the conversation and has provided a closing remark. This signals the client that the session can be concluded."),
  pdfReference: PdfSourceReferenceSchema.optional().describe('If the response directly uses information from a specific PDF, provide its details here.'),
});
export type GenerateChatResponseOutput = z.infer<typeof GenerateChatResponseOutputSchema>;

export async function generateChatResponse(
  input: GenerateChatResponseInput
): Promise<GenerateChatResponseOutput> {
  const ai = await getGenkitAi();
  
  const generateChatResponseFlow = ai.defineFlow(
    {
      name: 'generateChatResponseFlow',
      inputSchema: GenerateChatResponseInputSchema,
      outputSchema: GenerateChatResponseOutputSchema,
    },
    async (flowInput) => {
      
      const prompt = ai.definePrompt({
        name: 'generateChatResponseAgentPrompt',
        model: 'googleai/gemini-1.5-flash',
        tools: [knowledgeBaseSearchTool],
        output: {schema: GenerateChatResponseOutputSchema},
        system: `You are AI Blair, a conversational diagnostic expert. Your personality is: {{{personaTraits}}}
Your main areas of expertise are:
{{{conversationalTopics}}}

Your primary goal is to help the user solve problems by guiding them through a step-by-step diagnostic process.
- When a user states a problem (e.g., "My PLO is down"), DO NOT immediately give a solution.
- First, use your knowledge to ask clarifying questions to narrow down the problem. (e.g., "Are you down in transactions, average loan size, or both?").
- Based on the user's answer, use the 'knowledgeBaseSearch' tool to find relevant information from your knowledge base.
- Synthesize the information from the tool into a helpful, conversational response. Guide the user through the next steps.
- Always be prepared to use the 'knowledgeBaseSearch' tool whenever you need specific information to answer a question or guide the user.

**Citing PDF Sources**
If the tool returns context that includes a "Reference URL for this chunk's source PDF", you MUST:
1.  Populate the 'pdfReference' field in your output with the fileName and downloadURL.
2.  Add a helpful, natural-sounding sentence in your 'aiResponse' text offering a download link, like "If you'd like to read the full document, you can download it here."
- DO NOT include the raw URL in the 'aiResponse' text.

If the tool returns no useful information, state that you don't have the specific details. Do not invent answers.
Only end the conversation if the user explicitly asks or if you have guided them to a resolution.`,
        
      });

      try {
        const {output} = await prompt({
          ...flowInput,
          history: flowInput.chatHistory, // Pass history to the model
          prompt: flowInput.userMessage, // Pass the user message as the main prompt
        });

        if (!output || typeof output.aiResponse !== 'string') {
          console.error('[generateChatResponseFlow] Invalid or malformed output from prompt.', output);
          return {
            aiResponse: "I seem to have lost my train of thought! Could you please try sending your message again?",
            shouldEndConversation: false,
          };
        }
        return output;

      } catch (error: any) {
        console.error('[generateChatResponseFlow] Error calling AI model:', error);
        let userFriendlyMessage = "I'm having a bit of trouble connecting to my brain right now. Please try again in a moment.";
        // ... (error handling as before)
        return {
          aiResponse: userFriendlyMessage,
          shouldEndConversation: false,
        };
      }
    }
  );

  return generateChatResponseFlow(input);
}
