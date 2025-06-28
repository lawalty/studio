'use server';
/**
 * @fileOverview Extracts clean, readable text from any document URL using Vertex AI.
 * This flow bypasses Genkit for this specific task to use the more robust Vertex AI Node.js client,
 * which works reliably with Application Default Credentials (ADC).
 *
 * - extractTextFromDocumentUrl - A function that extracts text from a document given its URL.
 * - ExtractTextFromDocumentUrlInput - The input type.
 * - ExtractTextFromDocumentUrlOutput - The return type.
 */
import { z } from 'genkit';
import {
  VertexAI,
  Part,
  HarmCategory,
  HarmBlockThreshold,
} from '@google-cloud/vertexai';

const ExtractTextFromDocumentUrlInputSchema = z.object({
  documentUrl: z.string().url().describe('The public URL of the document file to process.'),
  conversationalTopics: z.string().optional().describe('A list of topics the AI should consider its area of expertise to guide extraction.'),
});
export type ExtractTextFromDocumentUrlInput = z.infer<typeof ExtractTextFromDocumentUrlInputSchema>;

const ExtractTextFromDocumentUrlOutputSchema = z.object({
  extractedText: z.string().describe('The clean, extracted text content from the document.'),
});
export type ExtractTextFromDocumentUrlOutput = z.infer<typeof ExtractTextFromDocumentUrlOutputSchema>;


// This function now uses the Vertex AI Node.js client directly to bypass Genkit configuration issues.
export async function extractTextFromDocumentUrl(
  input: ExtractTextFromDocumentUrlInput
): Promise<ExtractTextFromDocumentUrlOutput> {
  const { documentUrl, conversationalTopics } = ExtractTextFromDocumentUrlInputSchema.parse(input);

  try {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
      throw new Error('Google Cloud Project ID not found in environment variables. This is required for server-side authentication with Vertex AI.');
    }

    const vertex_ai = new VertexAI({ project: projectId, location: 'us-central1' });

    // NOTE: Using a specific model version for stability.
    const model = 'gemini-1.5-flash-001';

    const generativeModel = vertex_ai.getGenerativeModel({
      model: model,
      generationConfig: {
        temperature: 0.0,
      },
      // Set safety settings to be permissive for this text extraction task.
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    });

    // Fetch the document data from the provided public URL.
    const response = await fetch(documentUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch document from URL: ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type');
    if (!contentType) {
      throw new Error('Could not determine content type of the document from response headers.');
    }
    const documentBuffer = await response.arrayBuffer();
    const documentBase64 = Buffer.from(documentBuffer).toString('base64');
    
    const filePart: Part = {
        inlineData: {
            data: documentBase64,
            mimeType: contentType,
        },
    };

    const promptText = `You are an expert text extraction and cleaning tool. Your task is to extract all human-readable textual content from the document provided.
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

    const request = {
      contents: [{ role: 'user', parts: [filePart, { text: promptText }] }],
    };

    const result = await generativeModel.generateContent(request);
    
    if (
      !result.response ||
      !result.response.candidates ||
      result.response.candidates.length === 0 ||
      !result.response.candidates[0].content ||
      !result.response.candidates[0].content.parts ||
      result.response.candidates[0].content.parts.length === 0 ||
      !result.response.candidates[0].content.parts[0].text
    ) {
      const blockReason = result.response?.candidates?.[0]?.finishReason;
      const safetyRatings = JSON.stringify(result.response?.candidates?.[0]?.safetyRatings, null, 2);
      throw new Error(`Extraction failed: The AI model returned an empty or blocked response. Block Reason: ${blockReason || 'N/A'}. Safety Ratings: ${safetyRatings || 'N/A'}`);
    }

    let cleanedText = result.response.candidates[0].content.parts[0].text;
    cleanedText = cleanedText.replace(/```[a-z]*\n/g, '').replace(/```/g, '');
    cleanedText = cleanedText.trim();
    
    return { extractedText: cleanedText };

  } catch (e: any) {
    console.error('[extractTextFromDocumentUrl] A critical error occurred:', e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred during text extraction.';
    // Provide a more detailed error message for easier debugging.
    throw new Error(`Text extraction failed. This might be due to an issue with permissions, networking, or the document itself. Please check the service account IAM roles and enabled APIs in your Google Cloud project. Full technical error: ${errorMessage}`);
  }
}
