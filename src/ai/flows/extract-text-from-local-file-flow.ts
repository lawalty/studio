
'use client';
/**
 * @fileOverview Extracts clean, readable text from a local file object entirely on the client-side.
 * This approach avoids issues with passing large file URIs or expiring URLs to a server-side flow.
 *
 * - extractTextFromLocalFile - A client-side function that extracts text from a File object.
 * - ExtractTextFromLocalFileInput - The input type.
 * - ExtractTextFromLocalFileOutput - The return type.
 */
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Helper function to convert a File object to a Base64 Data URI
const fileToDataUri = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsDataURL(file);
  });
};


const ExtractTextFromLocalFileInputSchema = z.object({
  file: z.instanceof(File).describe("The local File object to process."),
});
export type ExtractTextFromLocalFileInput = z.infer<typeof ExtractTextFromLocalFileInputSchema>;

const ExtractTextFromLocalFileOutputSchema = z.object({
  extractedText: z.string().optional().describe('The clean, extracted text content from the document.'),
  error: z.string().optional().describe('An error message if the operation failed.'),
});
export type ExtractTextFromLocalFileOutput = z.infer<typeof ExtractTextFromLocalFileOutputSchema>;

export async function extractTextFromLocalFile(
  { file }: ExtractTextFromLocalFileInput
): Promise<ExtractTextFromLocalFileOutput> {
    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        return { error: "GEMINI_API_KEY is not configured in your environment. Please set NEXT_PUBLIC_GEMINI_API_KEY in .env.local" };
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-pro",
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
        ],
        generationConfig: {
          temperature: 0.1,
        }
      });

      const systemPrompt = `Your task is to extract all human-readable text from the provided document.

CRITICAL INSTRUCTIONS:
1.  Your primary goal is to perform Optical Character Recognition (OCR) to extract all human-readable text from the document, including text found within images.
2.  Preserve paragraph breaks and essential formatting like lists.
3.  Ignore page headers, footers, page numbers, and irrelevant metadata.
4.  Do NOT add any commentary, preamble, explanation, or summary.
5.  Do NOT wrap the output in code blocks or any other formatting.
6.  Your final output must ONLY be the clean, extracted text from the document. If the document is blank or contains no machine-readable text, you MUST return an empty response.`;

      const fileDataUri = await fileToDataUri(file);
      const mimeType = file.type;

      const result = await model.generateContent([
          systemPrompt,
          {
            inlineData: {
                mimeType,
                data: fileDataUri.split(',')[1],
            }
          }
      ]);
      
      const response = result.response;
      const extractedText = response.text()?.trim();

      if (extractedText) {
        let cleanedText = extractedText.replace(/```[a-z]*/g, '').replace(/```/g, '');
        cleanedText = cleanedText.trim();
        return { extractedText: cleanedText };
      } else {
        const errorMessage = `Text extraction failed to produce readable content. The document may be empty or an image-only PDF.`;
        return { error: errorMessage };
      }
      
    } catch (e: any) {
      console.error('[extractTextFromLocalFile] A critical error occurred during the AI call:', e);
      const rawError = e instanceof Error ? e.message : JSON.stringify(e);
      let detailedError: string;

      if (rawError.includes("503") || rawError.includes("Service Unavailable")) {
          detailedError = `Text extraction failed due to a temporary issue with the Google AI service (503 Service Unavailable). The service may be overloaded. Please wait a few moments and try uploading the file again.`;
      } else if (rawError.includes("API key not valid")) {
          detailedError = "Text extraction failed: The provided Google AI API Key is invalid. Please verify it in your .env.local file or hosting provider's secret manager.";
      } else if (rawError.includes("API key is missing")) {
          detailedError = "Text extraction failed: The GEMINI_API_KEY environment variable is not set. Please add it to your .env.local file or hosting provider's secret manager.";
      } else if (rawError.includes("permission denied") || rawError.includes('IAM')) {
          detailedError = `Text extraction failed due to a permissions issue. Please check that the 'Vertex AI API' is enabled in your Google Cloud project and that your account has the correct IAM permissions.`;
      } else if (rawError.includes("PROJECT_BILLING_NOT_ENABLED")) {
          detailedError = `CRITICAL: Text extraction failed because billing is not enabled for your Google Cloud project. Please go to your Google Cloud Console, select the correct project, and ensure that a billing account is linked.`;
      } else {
          detailedError = `Text extraction failed. This is most often caused by a missing/invalid GEMINI_API_KEY or a Google Cloud project configuration issue (e.g., Vertex AI API or billing not enabled). Full error: ${rawError}`;
      }
      
      return { error: detailedError };
    }
}
