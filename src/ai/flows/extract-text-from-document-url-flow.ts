'use server';
/**
 * @fileOverview Extracts clean, readable text from a document's public URL using Genkit and Vertex AI.
 *
 * - extractTextFromDocument - A function that extracts text from a document given its public URL.
 * - ExtractTextFromDocumentInput - The input type.
 * - ExtractTextFromDocumentOutput - The return type.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';

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
    try {
      const prompt = `Your task is to extract all human-readable text from the provided document.

CRITICAL INSTRUCTIONS:
1.  Focus exclusively on textual content. Ignore text that is part of an image or complex graphic.
2.  Preserve paragraph breaks and essential formatting like lists.
3.  Ignore page headers, footers, page numbers, and irrelevant metadata.
4.  Do NOT add any commentary, preamble, explanation, or summary.
5.  Do NOT wrap the output in code blocks or any other formatting.
6.  Your final output must ONLY be the clean, extracted text from the document. If the document is blank or contains no machine-readable text, you MUST return an empty response.`;

      const generationResult = await ai.generate({
        model: 'googleai/gemini-1.5-flash',
        prompt: [{ text: prompt }, { media: { url: documentUrl } }],
        config: {
          temperature: 0.1,
          safetySettings: [
            {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                threshold: 'BLOCK_NONE',
            },
            {
                category: 'HARM_CATEGORY_HATE_SPEECH',
                threshold: 'BLOCK_NONE',
            },
            {
                category: 'HARM_CATEGORY_HARASSMENT',
                threshold: 'BLOCK_NONE',
            },
            {
                category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                threshold: 'BLOCK_NONE',
            },
          ]
        },
      });

      const text = generationResult?.text?.trim();

      if (text) {
        let cleanedText = text.replace(/```[a-z]*/g, '').replace(/```/g, '');
        cleanedText = cleanedText.trim();
        return { extractedText: cleanedText };
      } else {
        const finishReason = generationResult?.finishReason || 'Unknown';
        const errorMessage = `Text extraction failed to produce content. This may be due to a malformed or empty file, a content safety block (Reason: ${finishReason}), or a temporary API issue. Please try a different document.`;
        return { error: errorMessage };
      }
      
    } catch (e: any) {
      console.error('[extractTextFromDocument] A critical error occurred during the AI call:', e);
      const rawError = e instanceof Error ? e.message : JSON.stringify(e);
      let detailedError: string;

      if (rawError.includes("503") || rawError.includes("Service Unavailable")) {
          detailedError = `Text extraction failed due to a temporary issue with the Google AI service (503 Service Unavailable). The service may be overloaded. Please wait a few moments and try uploading the file again.`;
      } else if (rawError.includes("API key not valid")) {
          detailedError = "Text extraction failed: The provided Google AI API Key is invalid. Please verify it in your .env.local file or hosting provider's secret manager.";
      } else if (rawError.includes("API key is missing")) {
          detailedError = "Text extraction failed: The GOOGLE_AI_API_KEY environment variable is not set. Please add it to your .env.local file or hosting provider's secret manager.";
      } else if (rawError.includes("permission denied") || rawError.includes('IAM')) {
          detailedError = `Text extraction failed due to a permissions issue. Please check that the 'Vertex AI API' is enabled in your Google Cloud project and that your account has the correct IAM permissions.`;
      } else if (rawError.includes("PROJECT_BILLING_NOT_ENABLED")) {
          detailedError = `CRITICAL: Text extraction failed because billing is not enabled for your Google Cloud project. Please go to your Google Cloud Console, select the correct project, and ensure that a billing account is linked.`;
      } else {
          detailedError = `Text extraction failed. This is most often caused by a missing/invalid GOOGLE_AI_API_KEY or a Google Cloud project configuration issue (e.g., Vertex AI API or billing not enabled). Full error: ${rawError}`;
      }
      
      return { error: detailedError };
    }
}
