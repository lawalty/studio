
'use server';
/**
 * @fileOverview This flow is now DEPRECATED and is not used.
 * Text extraction logic has been moved to the client-side in the new
 * `extract-text-from-local-file-flow.ts` to more reliably handle
 * large files by processing them in the browser before upload.
 */
import { z } from 'zod';
import { ai } from '@/ai/genkit';

const ExtractTextFromDocumentInputSchema = z.object({
  documentUrl: z.string().url().describe("The public URL of the document to process."),
});
export type ExtractTextFromDocumentInput = z.infer<typeof ExtractTextFromDocumentInputSchema>;

const ExtractTextFromDocumentOutputSchema = z.object({
  extractedText: z.string().optional().describe('The clean, extracted text content from the document.'),
  error: z.string().optional().describe('An error message if the operation failed.'),
});
export type ExtractTextFromDocumentOutput = z.infer<typeof ExtractTextFromDocumentOutputSchema>;

export async function extractTextFromDocument(
  { documentUrl }: ExtractTextFromDocumentInput
): Promise<ExtractTextFromDocumentOutput> {
    const message = "This flow is deprecated. Use extractTextFromLocalFile instead.";
    console.warn(`[extractTextFromDocument] ${message}`);
    return {
      error: message
    };
}
