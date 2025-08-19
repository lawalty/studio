
'use server';
/**
 * @fileOverview This flow extracts text from a document available at a public URL.
 * It's used as a server-side fallback for file types that the client-side
 * `extractTextFromLocalFile` flow cannot reliably handle, such as .docx files.
 */
import { z } from 'zod';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';


const ExtractTextFromDocumentInputSchema = z.object({
  documentUrl: z.string().url().describe("The public URL of the document to process."),
  extractionMode: z.enum(['standard', 'deep']).optional().default('standard').describe("The extraction method to use. 'deep' is for text-heavy documents."),
});
export type ExtractTextFromDocumentInput = z.infer<typeof ExtractTextFromDocumentInputSchema>;

const ExtractTextFromDocumentOutputSchema = z.object({
  extractedText: z.string().optional().describe('The clean, extracted text content from the document.'),
  error: z.string().optional().describe('An error message if the operation failed.'),
});
export type ExtractTextFromDocumentOutput = z.infer<typeof ExtractTextFromDocumentOutputSchema>;

const DEEP_EXTRACTION_PROMPT = `Your task is to perform a deep and exhaustive text extraction from the provided document.
CRITICAL INSTRUCTIONS:
1.  Your single most important goal is to extract ALL text, including text within any images (OCR).
2.  You MUST process the entire document from start to finish.
3.  Preserve all paragraph breaks, lists, and essential formatting. Every line break might be important.
4.  You are FORBIDDEN from summarizing, analyzing, or altering the content.
5.  You MUST NOT add any commentary, preamble, or notes.
6.  Your output MUST be ONLY the clean, raw, extracted text from the document.
7.  If the document is blank or unreadable, return an empty response.`;

const STANDARD_EXTRACTION_PROMPT = `Your task is to extract all human-readable text from the provided document.
CRITICAL INSTRUCTIONS:
1.  Perform OCR to extract all text, including text within images.
2.  Preserve paragraph breaks and essential formatting.
3.  Ignore headers, footers, and page numbers.
4.  Do NOT add any commentary, preamble, or summary.
5.  Your output MUST ONLY be the clean, extracted text.`;


export async function extractTextFromDocument(
  { documentUrl, extractionMode }: ExtractTextFromDocumentInput
): Promise<ExtractTextFromDocumentOutput> {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not configured on the server.");
        }
        
        const response = await fetch(documentUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch document from URL: ${response.statusText}`);
        }
        const fileBuffer = await response.arrayBuffer();
        const mimeType = response.headers.get('content-type') || 'application/octet-stream';
        const fileDataUri = `data:${mimeType};base64,${Buffer.from(fileBuffer).toString('base64')}`;

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-pro",
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ],
            generationConfig: { 
              temperature: 0.1,
              maxOutputTokens: 8192,
            }
        });

        const systemPrompt = extractionMode === 'deep' ? DEEP_EXTRACTION_PROMPT : STANDARD_EXTRACTION_PROMPT;

        const result = await model.generateContent([
            systemPrompt,
            { inlineData: { 
                data: fileDataUri.split(',')[1],
                mimeType,
             } }
        ]);
        
        const text = result.response.text()?.trim() ?? '';
        if (text) {
            return { extractedText: text.replace(/```[a-z]*/g, '').replace(/```/g, '').trim() };
        } else {
            return { error: "Text extraction failed. The document might be empty or unreadable." };
        }
      
    } catch (e: any) {
      console.error('[extractTextFromDocument] A critical error occurred:', e);
      return { error: `Server-side text extraction failed: ${e.message}` };
    }
}
