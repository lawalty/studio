
'use server';
/**
 * @fileOverview Extracts text from a PDF using Genkit and Gemini.
 *
 * - extractTextFromPdfUrl - A function that extracts text from a PDF given its URL.
 * - ExtractTextFromPdfUrlInput - The input type.
 * - ExtractTextFromPdfUrlOutput - The return type.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractTextFromPdfUrlInputSchema = z.object({
  pdfUrl: z.string().url().describe('The public URL of the PDF file to process.'),
});
export type ExtractTextFromPdfUrlInput = z.infer<typeof ExtractTextFromPdfUrlInputSchema>;

const ExtractTextFromPdfUrlOutputSchema = z.object({
  extractedText: z.string().describe('The extracted text content from the PDF.'),
});
export type ExtractTextFromPdfUrlOutput = z.infer<typeof ExtractTextFromPdfUrlOutputSchema>;

export async function extractTextFromPdfUrl(
  input: ExtractTextFromPdfUrlInput
): Promise<ExtractTextFromPdfUrlOutput> {
  return extractTextFromPdfUrlFlow(input);
}

const extractTextPrompt = ai.definePrompt({
  name: 'extractTextFromPdfPrompt',
  input: { schema: ExtractTextFromPdfUrlInputSchema },
  output: { schema: ExtractTextFromPdfUrlOutputSchema },
  prompt: `You are an expert text extraction tool. Your only task is to extract all textual content from the PDF document provided.
- Prioritize completeness and accuracy of the text.
- Maintain paragraph breaks.
- Do not add any commentary, preamble, or explanation.
- Do not wrap the output in code blocks or JSON formatting.
- Only return the raw, extracted text.

PDF Document: {{media url=pdfUrl}}`,
  model: 'googleai/gemini-1.5-flash-latest',
  config: {
    temperature: 0.0, // For deterministic extraction
  }
});

const extractTextFromPdfUrlFlow = ai.defineFlow(
  {
    name: 'extractTextFromPdfUrlFlow',
    inputSchema: ExtractTextFromPdfUrlInputSchema,
    outputSchema: ExtractTextFromPdfUrlOutputSchema,
  },
  async (input) => {
    try {
      const { output } = await extractTextPrompt(input);

      if (!output || typeof output.extractedText !== 'string') {
        console.error('[extractTextFromPdfUrlFlow] Invalid or malformed output from prompt. Expected { extractedText: string }, received:', output);
        throw new Error('Extraction failed: The AI model returned an unexpected data structure. The PDF might be incompatible, corrupted, or an issue occurred with the model.');
      }
      
      // The improved prompt should prevent the model from escaping newlines, making this unnecessary.
      // output.extractedText = output.extractedText.replace(/\\n/g, '\n');
      
      return output;
    } catch (e: any) {
      console.error('[extractTextFromPdfUrlFlow] Error during text extraction flow:', e);
      let errorMessage = 'Failed to extract text from PDF due to an internal error.';
      if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === 'string') {
        errorMessage = e;
      }
      // Prepend a clear indicator for easier debugging from client-side toast
      throw new Error(`Genkit PDF Extraction Error: ${errorMessage}`);
    }
  }
);
