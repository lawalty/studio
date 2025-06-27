'use server';
/**
 * @fileOverview Extracts clean, readable text from any document URL using Gemini.
 *
 * - extractTextFromDocumentUrl - A function that extracts text from a document given its URL.
 * - ExtractTextFromDocumentUrlInput - The input type.
 * - ExtractTextFromDocumentUrlOutput - The return type.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { gemini15Flash } from '@genkit-ai/googleai';


const ExtractTextFromDocumentUrlInputSchema = z.object({
  documentUrl: z.string().url().describe('The public URL of the document file to process.'),
  conversationalTopics: z.string().optional().describe('A list of topics the AI should consider its area of expertise to guide extraction.'),
});
export type ExtractTextFromDocumentUrlInput = z.infer<typeof ExtractTextFromDocumentUrlInputSchema>;

const ExtractTextFromDocumentUrlOutputSchema = z.object({
  extractedText: z.string().describe('The clean, extracted text content from the document.'),
});
export type ExtractTextFromDocumentUrlOutput = z.infer<typeof ExtractTextFromDocumentUrlOutputSchema>;

export async function extractTextFromDocumentUrl(
  input: ExtractTextFromDocumentUrlInput
): Promise<ExtractTextFromDocumentUrlOutput> {
  return extractTextFromDocumentUrlFlow(input);
}

const extractTextFromDocumentUrlFlow = ai.defineFlow(
  {
    name: 'extractTextFromDocumentUrlFlow',
    inputSchema: ExtractTextFromDocumentUrlInputSchema,
    outputSchema: ExtractTextFromDocumentUrlOutputSchema,
  },
  async (input) => {
    try {
      const extractTextPrompt = ai.definePrompt({
        name: 'extractTextFromDocumentUrlPrompt',
        input: { schema: ExtractTextFromDocumentUrlInputSchema },
        output: { schema: ExtractTextFromDocumentUrlOutputSchema },
        prompt: `You are an expert text extraction and cleaning tool. Your task is to extract all human-readable textual content from the document provided.
      {{#if conversationalTopics}}
      To improve the indexing for a conversational AI, use the following topics as a guide to identify the most relevant information and structure. Pay special attention to content related to these topics, but do not omit other relevant information.
      Conversational Topics:
      {{{conversationalTopics}}}
      {{/if}}
      - Identify and extract the main body of text.
      - Ignore headers, footers, page numbers, and irrelevant metadata unless they are part of the main content.
      - Preserve paragraph breaks and essential formatting.
      - Correct common character encoding errors (e.g., replace sequences like 'â€™' with a standard apostrophe ').
      - Remove all other non-readable characters, control characters, and gibberish.
      - Do not add any commentary, preamble, explanation, or summary.
      - Do not wrap the output in code blocks or JSON formatting.
      - Your final output should only be the clean, extracted text, ready for processing.

      Document to process: {{media url=documentUrl}}`,
        model: gemini15Flash, // Use the default model instance
        config: {
          temperature: 0.0, // For deterministic extraction
        }
      });

      const { output } = await extractTextPrompt(input);

      if (!output || typeof output.extractedText !== 'string') {
        console.error('[extractTextFromDocumentUrlFlow] Invalid or malformed output from prompt. Expected { extractedText: string }, received:', output);
        throw new Error('Extraction failed: The AI model returned an unexpected data structure. The document might be incompatible, corrupted, or an issue occurred with the model.');
      }
      
      // Aggressively clean up potential markdown formatting from the AI's output.
      let cleanedText = output.extractedText;
      // Remove markdown code block fences (e.g., ```json, ```text, ```)
      cleanedText = cleanedText.replace(/```[a-z]*\n/g, '').replace(/```/g, '');
      // Trim whitespace and newlines from the start and end
      cleanedText = cleanedText.trim();

      return { extractedText: cleanedText };

    } catch (e: any) {
      console.error('[extractTextFromDocumentUrlFlow] Error during text extraction flow:', e);

      let userFriendlyError = 'An unexpected error occurred during document processing.';
      const errorMessage = e instanceof Error ? e.message.toLowerCase() : '';

      if (errorMessage.includes('permission_denied') || errorMessage.includes('403')) {
          userFriendlyError = 'Could not access the document. Please ensure the file URL is public and accessible.';
      } else if (errorMessage.includes('api key not valid')) {
          userFriendlyError = 'The provided GOOGLE_AI_API_KEY is invalid. Please check the key in your .env.local file and ensure it is correct.';
      } else if (errorMessage.includes('file format is not supported') || errorMessage.includes('unsupported file format')) {
          userFriendlyError = 'The document format is not supported by the AI. Please try a different file type like PDF or a standard text file.';
      } else if (errorMessage.includes('deadline_exceeded') || errorMessage.includes('timeout')) {
          userFriendlyError = 'The request to process the document timed out. The file might be too large or the service is temporarily busy. Please try again later.';
      } else if (errorMessage.includes('invalid argument') || errorMessage.includes('malformed')) {
          userFriendlyError = 'The AI model could not read the document. It might be corrupted or in an unexpected format.';
      } else {
          // Fallback for other errors, but we remove the confusing API key suggestion
          userFriendlyError = `The document could not be processed. Details: ${e.message || 'Unknown error'}`;
      }

      throw new Error(userFriendlyError);
    }
  }
);
