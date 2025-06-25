
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

// This is the core of the user's suggestion: Use AI to intelligently extract text.
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
  model: 'googleai/gemini-1.5-flash-latest',
  config: {
    temperature: 0.0, // For deterministic extraction
  }
});

const extractTextFromDocumentUrlFlow = ai.defineFlow(
  {
    name: 'extractTextFromDocumentUrlFlow',
    inputSchema: ExtractTextFromDocumentUrlInputSchema,
    outputSchema: ExtractTextFromDocumentUrlOutputSchema,
  },
  async (input) => {
    try {
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
      let errorMessage = 'Failed to extract text from document due to an internal error.';
      if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === 'string') {
        errorMessage = e;
      }
      // Prepend a clear indicator for easier debugging from client-side toast
      throw new Error(`Genkit Document Extraction Error: ${errorMessage}`);
    }
  }
);
