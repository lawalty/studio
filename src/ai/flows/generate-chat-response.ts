
'use server';
/**
 * @fileOverview A Genkit flow that generates a chat response from an AI model.
 * It uses a tool-based, retrieval-augmented generation (RAG) approach. The AI can
 * ask clarifying questions before deciding to search the knowledge base.
 */
import { getGenkitAi } from '@/ai/genkit';
import { z } from 'zod';
import { searchKnowledgeBase } from '../retrieval/vector-search';

// Zod schema for the input of the generateChatResponse flow.
export const GenerateChatResponseInputSchema = z.object({
  userMessage: z.string().describe('The message sent by the user.'),
  personaTraits: z.string().describe("A summary of the AI's personality and character traits."),
  conversationalTopics: z.string().describe("A comma-separated list of topics the AI is an expert in."),
  chatHistory: z.array(z.object({
    role: z.enum(['user', 'model']),
    parts: z.array(z.object({
      text: z.string(),
    })),
  })).optional().describe('The history of the conversation so far.'),
});
export type GenerateChatResponseInput = z.infer<typeof GenerateChatResponseInputSchema>;

// Zod schema for the output of the generateChatResponse flow.
const GenerateChatResponseOutputSchema = z.object({
  aiResponse: z.string().describe("The AI's generated response."),
  shouldEndConversation: z.boolean().describe('Indicates whether the conversation should end based on the AI response.'),
  pdfReference: z.object({
    fileName: z.string(),
    downloadURL: z.string(),
  }).optional().describe('A reference to a PDF document if the AI response is based on one.'),
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
    async ({ userMessage, personaTraits, conversationalTopics, chatHistory }) => {

      // Define the tool INSIDE the flow to ensure it uses the same `ai` instance.
      const knowledgeBaseSearch = ai.defineTool(
        {
          name: 'knowledgeBaseSearch',
          description: 'Searches the knowledge base for specific, detailed user queries to find context for an answer. Do not use for vague questions.',
          inputSchema: z.object({ query: z.string().describe('A specific and detailed question to search for in the knowledge base.') }),
          outputSchema: z.string(), // The context string
        },
        async ({ query }) => {
          // searchKnowledgeBase returns a formatted string, which is what we want.
          return await searchKnowledgeBase(query, {}); 
        }
      );
      
      // Define the prompt for the AI model, making the tool available.
      const chatPrompt = ai.definePrompt({
        name: 'chatResponsePrompt',
        tools: [knowledgeBaseSearch],
        input: { schema: GenerateChatResponseInputSchema },
        output: { schema: GenerateChatResponseOutputSchema },
        prompt: `You are a conversational AI. Your persona is defined by these traits: "{{personaTraits}}".
Your primary areas of expertise are: "{{conversationalTopics}}".

You are having a conversation with a user. Here is their latest message: "{{userMessage}}"

**CRITICAL INSTRUCTIONS FOR YOUR RESPONSE:**

1.  **Analyze the User's Intent:** First, determine if the user's message is a clear, specific question or if it is vague, ambiguous, or a general statement.

2.  **Ask Clarifying Questions (If Needed):**
    *   If the user's message is vague (e.g., "My PLO is down," "Tell me about compliance"), you MUST ask clarifying questions to understand their specific need before trying to answer.
    *   Example Clarification: If the user says "My PLO is down", you should ask: "I can help with that. Are you asking about a decrease in transactions, the average loan size, or something else?"
    *   Your goal is to get a specific, actionable query from the user. Do NOT use the knowledge base tool until you have this clarity.

3.  **Search the Knowledge Base (When Ready):**
    *   Once you have a specific query (either from the user's initial message or after your clarifying questions), use the \`knowledgeBaseSearch\` tool to find relevant information.
    *   Provide a clear, concise query to the tool.

4.  **Formulate Your Answer:**
    *   Use the information returned by the tool to construct a comprehensive and helpful answer.
    *   If the tool returns no relevant information, state that you couldn't find specific details on that topic but provide a helpful, general response based on your persona.
    *   If the user is just making small talk or asking a question outside your expertise, respond conversationally without using the tool.

5.  **Determine if the Conversation Should End:** Based on the interaction, set the \`shouldEndConversation\` flag to true if it feels like a natural conclusion.

Your final response MUST be a single, valid JSON object that strictly matches the output schema.
`,
      });

      // Call the LLM with all the necessary information. It will decide whether to ask a question or call the tool.
      try {
        const { output } = await chatPrompt(
          { userMessage, personaTraits, conversationalTopics, chatHistory },
          {
            history: chatHistory,
            config: {
              temperature: 0.2,
            },
          }
        );

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

        if (error.message && error.message.includes('API key not valid')) {
          userFriendlyMessage = "There seems to be an issue with my connection to Google. Please check the API key configuration.";
        } else if (error.message && error.message.includes('permission')) {
          userFriendlyMessage = "It looks like I don't have the right permissions to access some information. This is a configuration issue.";
        } else if (error.message && (error.message.includes('tool_code') || error.message.includes('tool calling'))) {
          userFriendlyMessage = "I'm having a little trouble using my knowledge base right now. Let's try that again in a moment.";
        }


        return {
          aiResponse: userFriendlyMessage,
          shouldEndConversation: false,
        };
      }
    }
  );

  return generateChatResponseFlow(input);
}
