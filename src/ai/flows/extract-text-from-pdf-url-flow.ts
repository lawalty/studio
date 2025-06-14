
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
  prompt: `You are an expert text extraction tool.
Please extract all textual content from the PDF document provided via the media URL.
Focus on accurately capturing the text, maintaining paragraphs and structure where possible, but prioritize completeness of the text.
Ignore any complex formatting, images, or tables if they hinder text extraction. Only return the extracted text.

PDF Document: {{media url=pdfUrl}}

Extracted Text:`,
  // Using gemini-1.5-flash-latest as it's generally good and fast.
  // If extraction quality is poor for complex PDFs, consider gemini-1.5-pro-latest.
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
    const { output } = await extractTextPrompt(input);
    if (!output) {
      // Throw an error if the output is unexpectedly null or undefined
      throw new Error('No output received from the text extraction prompt. The PDF might be empty or unreadable.');
    }
    return output;
  }
);

