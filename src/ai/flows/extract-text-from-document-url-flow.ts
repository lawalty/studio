
'use server';
/**
 * @fileOverview Extracts clean, readable text from any document URL using Genkit and Vertex AI.
 *
 * - extractTextFromDocumentUrl - A function that extracts text from a document given its URL.
 * - ExtractTextFromDocumentUrlInput - The input type.
 * - ExtractTextFromDocumentUrlOutput - The return type.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';

const ExtractTextFromDocumentUrlInputSchema = z.object({
  documentUrl: z.string().url().describe('The public URL of the document file to process.'),
  conversationalTopics: z.string().optional().describe('A list of topics the AI should consider its area of expertise to guide extraction.'),
});
export type ExtractTextFromDocumentUrlInput = z.infer<typeof ExtractTextFromDocumentUrlInputSchema>;

const ExtractTextFromDocumentUrlOutputSchema = z.object({
  extractedText: z.string().optional().describe('The clean, extracted text content from the document.'),
  error: z.string().optional().describe('An error message if the operation failed.'),
});
export type ExtractTextFromDocumentUrlOutput = z.infer<typeof ExtractTextFromDocumentUrlOutputSchema>;


export async function extractTextFromDocumentUrl(
  { documentUrl }: ExtractTextFromDocumentUrlInput // conversationalTopics is no longer used in the prompt for robustness.
): Promise<ExtractTextFromDocumentUrlOutput> {
    try {
      // This new prompt is simpler and more direct to improve reliability.
      const prompt = `Your task is to extract all human-readable text from the provided document, from the first page to the last.

CRITICAL INSTRUCTIONS:
1.  Focus exclusively on textual content. Ignore text that is part of an image or complex graphic.
2.  Preserve paragraph breaks and essential formatting like lists.
3.  Ignore page headers, footers, page numbers, and irrelevant metadata.
4.  Do NOT add any commentary, preamble, explanation, or summary.
5.  Do NOT wrap the output in code blocks or any other formatting.
6.  Your final output must ONLY be the clean, extracted text from the document.`;

      const generationResult = await ai.generate({
        model: 'googleai/gemini-1.5-flash',
        prompt: [{ text: prompt }, { media: { url: documentUrl } }],
        config: {
          temperature: 0.1, // A small amount of temperature can help with reliability.
        },
      });

      const text = generationResult?.text;

      // A successful response *must* have a non-empty string as text.
      if (text && typeof text === 'string' && text.trim().length > 0) {
        // Clean up markdown code blocks if the model accidentally adds them.
        let cleanedText = text.replace(/```[a-z]*/g, '').replace(/```/g, '');
        cleanedText = cleanedText.trim();
        return { extractedText: cleanedText };
      } else {
        // If we get here, the model did not return usable text.
        console.error('[extractTextFromDocumentUrl] AI did not return valid text. Response:', generationResult);
        const finishReason = generationResult?.finishReason || 'Unknown';
        const errorMessage = `Text extraction failed to produce content. This may be due to a malformed or empty file, a content safety block, or a temporary API issue. Please try a different document. (Reason: ${finishReason})`;
        return { error: errorMessage };
      }
      
    } catch (e: any) {
      console.error('[extractTextFromDocumentUrl] A critical error occurred during the AI call:', e);
      const rawError = e instanceof Error ? e.message : JSON.stringify(e);
      let detailedError: string;

      if (rawError.includes("API key not valid")) {
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
