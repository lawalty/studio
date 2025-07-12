
'use server';
/**
 * @fileOverview A server-side flow to process an uploaded document from Firebase Storage,
 * extract its text, chunk it, and write the chunks to Firestore to be indexed by
 * the "Semantic Search with Vertex AI" extension.
 */
import { z } from 'zod';
import { ai, defineFlow, startFlow } from '@/ai/genkit';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

// Ensure Firebase is initialized (idempotent)
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = getFirestore();

// Helper function for splitting text into chunks
function simpleSplitter(text: string, { chunkSize = 1000, chunkOverlap = 100 } = {}): string[] {
    if (chunkOverlap >= chunkSize) {
        throw new Error("chunkOverlap must be smaller than chunkSize.");
    }
    const chunks: string[] = [];
    let index = 0;
    while (index < text.length) {
        const end = index + chunkSize;
        const chunk = text.slice(index, end);
        chunks.push(chunk);
        index += chunkSize - chunkOverlap;
    }
    return chunks;
}


// Define the input schema for the main processing flow
export const ProcessDocumentInputSchema = z.object({
  sourceId: z.string().describe("The unique ID of the source document."),
  sourceName: z.string().describe("The original filename of the document."),
  level: z.string().describe("The priority level (e.g., 'High', 'Medium')."),
  topic: z.string().describe("The topic category for the document."),
  downloadURL: z.string().url().describe("The public download URL from Firebase Storage."),
  mimeType: z.string().describe("The MIME type of the uploaded file (e.g., 'text/plain')."),
});
export type ProcessDocumentInput = z.infer<typeof ProcessDocumentInputSchema>;


// Define a sub-flow for AI-powered text extraction
const extractTextFromDocument = defineFlow(
    {
        name: "extractTextFromDocumentInternal",
        inputSchema: z.object({
            documentUrl: z.string().url(),
            mimeType: z.string(),
        }),
        outputSchema: z.object({ extractedText: z.string().optional(), error: z.string().optional() }),
    },
    async ({ documentUrl, mimeType }) => {
        try {
            const model = ai.model("gemini-1.5-flash");
            const response = await model.generate({
                prompt: [{
                    data: { uri: documentUrl, mimeType }
                }, {
                    text: "Extract all the text from this document. If the document is not a supported file type or if it is empty, respond with 'NO_TEXT_FOUND'."
                }]
            });
            const text = response.text();
            if (!text || text.trim() === 'NO_TEXT_FOUND' || text.trim() === '') {
                return { error: 'No readable text was found in the document.' };
            }
            return { extractedText: text };
        } catch (e: any) {
            return { error: e.message || "An unknown error occurred during AI text extraction." };
        }
    }
);


// Define the main document processing flow
export const processDocumentFlow = defineFlow(
  {
    name: 'processDocumentFlow',
    inputSchema: ProcessDocumentInputSchema,
    outputSchema: z.object({ success: z.boolean(), error: z.string().optional() }),
  },
  async (input) => {
    const { sourceId, downloadURL, mimeType, sourceName, level, topic } = input;
    const metaCollectionName = `kb_${level.toLowerCase()}_meta_v1`;
    const docRef = db.collection(metaCollectionName).doc(sourceId);

    try {
        let cleanText: string;

        // 1. Extract text
        await docRef.update({ indexingStatus: 'processing', indexingError: `Extracting text from ${mimeType}...` });

        if (mimeType === 'text/plain') {
            const bucket = getStorage().bucket();
            const decodedUrl = decodeURIComponent(downloadURL);
            const pathStartIndex = decodedUrl.indexOf('/o/') + 3;
            const pathEndIndex = decodedUrl.indexOf('?');
            const filePath = decodedUrl.substring(pathStartIndex, pathEndIndex);
            
            const file = bucket.file(filePath);
            const contents = await file.download();
            cleanText = contents.toString('utf8');
        } else {
            const extractionResult = await startFlow(extractTextFromDocument, { documentUrl: downloadURL, mimeType });
            if (extractionResult.error || !extractionResult.extractedText) {
                throw new Error(extractionResult.error || 'Text extraction failed to produce content.');
            }
            cleanText = extractionResult.extractedText.trim();
        }

        if (!cleanText) {
            throw new Error("No readable text content found in the document.");
        }

        // 2. Chunk text
        await docRef.update({ indexingStatus: 'processing', indexingError: 'Chunking text...' });
        const chunks = simpleSplitter(cleanText);
        if (chunks.length === 0) {
            throw new Error("Text content was too short to be chunked.");
        }

        // 3. Write chunks to Firestore for the extension to process
        await docRef.update({ indexingStatus: 'processing', indexingError: `Indexing ${chunks.length} chunks...` });
        const batch = db.batch();
        const chunksCollection = db.collection('kb_chunks');
        
        chunks.forEach((chunkText, index) => {
            const newChunkDocRef = chunksCollection.doc(); 
            batch.set(newChunkDocRef, {
                sourceId,
                sourceName,
                level,
                topic,
                text: chunkText,
                chunkNumber: index + 1,
                createdAt: FieldValue.serverTimestamp(),
                downloadURL: downloadURL || null,
            });
        });
        await batch.commit();

        // 4. Final success update to the metadata document
        await docRef.update({
            indexingStatus: 'success',
            indexingError: null,
            chunksWritten: chunks.length,
            indexedAt: FieldValue.serverTimestamp(),
        });

        console.log(`[Flow] Successfully processed and indexed ${sourceName}.`);
        return { success: true };

    } catch (error: any) {
        console.error("[Flow] Error processing document:", error);
        try {
            await docRef.update({
                indexingStatus: 'failed',
                indexingError: error.message || "An unknown error occurred in the processing flow.",
            });
        } catch (updateError) {
            console.error("[Flow] CRITICAL: Failed to write failure status back to Firestore.", updateError);
        }
        return { success: false, error: error.message };
    }
  }
);
