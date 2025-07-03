'use server';
/**
 * @fileOverview Extracts clean, readable text from any document URL using Genkit and Vertex AI.
 *
 * - extractTextFromDocumentUrl - A function that extracts text from a document given its URL.
 * - ExtractTextFromDocumentUrlInput - The input type.
 * - ExtractTextFromDocumentUrlOutput - The return type.
 */
import { getGenkitAi } from '@/ai/genkit';
import { z } from 'genkit';

const ExtractTextFromDocumentUrlInputSchema = z.object({
  documentUrl: z.string().url().describe('The public URL of the document file to process.'),
  conversationalTopics: z.string().optional().describe('A list of topics the AI should consider its area of expertise to guide extraction.'),
});
export type ExtractTextFromDocumentUrlInput = z.infer<typeof ExtractTextFromDocumentUrlInputSchema>;

const ExtractTextFromDocumentUrlOutputSchema = z.object({
  extractedText: z.string().describe('The clean, extracted text content from the document.'),
});
export type ExtractTextFromDocumentUrlOutput = z.infer<typeof ExtractTextFromDocumentUrlOutputSchema>;

// This function now dynamically initializes Genkit on each call.
export async function extractTextFromDocumentUrl(
  input: ExtractTextFromDocumentUrlInput
): Promise<ExtractTextFromDocumentUrlOutput> {
  const ai = await getGenkitAi();

  const extractTextFromDocumentUrlFlow = ai.defineFlow(
    {
      name: 'extractTextFromDocumentUrlFlow',
      inputSchema: ExtractTextFromDocumentUrlInputSchema,
      outputSchema: ExtractTextFromDocumentUrlOutputSchema,
    },
    async ({ documentUrl, conversationalTopics }) => {
      try {
        const prompt = `You are an expert text extraction and cleaning tool. Your task is to extract all human-readable textual content from the document provided.
        ${conversationalTopics ? `
        To improve the indexing for a conversational AI, use the following topics as a guide to identify the most relevant information and structure. Pay special attention to content related to these topics, but do not omit other relevant information.
        Conversational Topics:
        ${conversationalTopics}` : ''}
        - Identify and extract the main body of text.
        - Ignore headers, footers, page numbers, and irrelevant metadata unless they are part of the main content.
        - Preserve paragraph breaks and essential formatting.
        - Correct common character encoding errors (e.g., replace sequences like 'â€™' with a standard apostrophe ').
        - Remove all other non-readable characters, control characters, and gibberish.
        - Do not add any commentary, preamble, explanation, or summary.
        - Do not wrap the output in code blocks or JSON formatting.
        - Your final output should only be the clean, extracted text, ready for processing.`;

        const { text } = await ai.generate({
          model: 'googleai/gemini-1.5-flash',
          prompt: [{ text: prompt }, { media: { url: documentUrl } }],
          config: {
            temperature: 0.0,
          },
        });

        let cleanedText = text.replace(/```[a-z]*\n/g, '').replace(/```/g, '');
        cleanedText = cleanedText.trim();
        
        return { extractedText: cleanedText };
        
      } catch (e: any) {
        console.error('[extractTextFromDocumentUrlFlow] A critical error occurred:', e);
        const rawError = e instanceof Error ? e.message : JSON.stringify(e);
        let detailedError: string;

        if (rawError.includes("Could not refresh access token") && rawError.includes("500")) {
            detailedError = `CRITICAL: Text extraction failed with a Google Cloud internal error (500), likely due to a project configuration issue, not a code bug. Please check the following: 1) Propagation Time: If you just enabled billing or APIs, it can take 5-10 minutes to activate. Please try again in a few minutes. 2) API Key: Ensure the Google AI API Key saved in the admin panel is correct and from the right project. 3) API Status: Double-check that the 'Vertex AI API' is enabled in the Google Cloud Console for this project. Full technical error: ${rawError}`;
        } else if (rawError.includes('permission denied') || rawError.includes('IAM')) {
            detailedError = `Text extraction failed due to a permissions issue. Please check that the App Hosting service account has the required IAM roles (e.g., Vertex AI User) and that the necessary Google Cloud APIs are enabled. Full technical error: ${rawError}`;
        } else {
            detailedError = `Text extraction failed. This might be due to a networking issue or an invalid document. Full technical error: ${rawError}`;
        }
        
        throw new Error(detailedError);
      }
    }
  );

  return extractTextFromDocumentUrlFlow(input);
}
