
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { text } from "stream/consumers";

// Genkit Tools
import { configureGenkit } from "@genkit-ai/core";
import { firebase } from "@genkit-ai/firebase";
import { googleAI } from "@genkit-ai/googleai";
import { defineFlow, startFlow } from "@genkit-ai/flow";
import { z } from "zod";

// Initialize Genkit
configureGenkit({
    plugins: [
        firebase(),
        googleAI({ apiKey: process.env.GOOGLE_AI_API_KEY }),
    ],
    logSinks: ["firebase"],
    enableTracingAndMetrics: true,
});

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = getFirestore();

// Simple text splitter
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


// Define the input schema for our text extraction flow
const ExtractTextSchema = z.object({
    documentUrl: z.string().url(),
});

// Define the text extraction flow using Genkit
const extractTextFromDocument = defineFlow(
    {
        name: "extractTextFromDocument",
        inputSchema: ExtractTextSchema,
        outputSchema: z.object({ extractedText: z.string().optional(), error: z.string().optional() }),
    },
    async ({ documentUrl }) => {
        try {
            const model = googleAI.model("gemini-1.5-flash");
            const response = await model.generate({
                prompt: [{
                    data: {
                        uri: documentUrl,
                        mimeType: "application/pdf"
                    }
                }, {
                    text: "Extract all the text from this document. If the document is not a PDF, DOCX, or text file, or if it is empty, respond with 'NO_TEXT_FOUND'."
                }]
            });

            const text = response.text();
            if (!text || text.trim() === 'NO_TEXT_FOUND') {
                return { error: 'No readable text was found in the document.' };
            }
            return { extractedText: text };
        } catch (e: any) {
            console.error("Error in text extraction flow:", e);
            return { error: e.message || "An unknown error occurred during text extraction." };
        }
    }
);


// Cloud Function that triggers on new document creation in any of the metadata collections
export const processKnowledgeBaseUpload = functions.firestore
    .document('kb_{level}_meta_v1/{docId}')
    .onCreate(async (snap, context) => {
        const sourceData = snap.data();
        const docRef = snap.ref;

        if (!sourceData || !sourceData.downloadURL) {
            console.log("Document created without a downloadURL. Exiting.");
            return;
        }

        const { downloadURL, sourceName, level, topic, id: sourceId } = sourceData;

        try {
            // 1. Extract text
            await docRef.update({ indexingStatus: 'processing', indexingError: 'Extracting text...' });
            const extractionResult = await startFlow(extractTextFromDocument, { documentUrl: downloadURL });

            if (extractionResult.error || !extractionResult.extractedText) {
                throw new Error(extractionResult.error || 'Text extraction failed to produce content.');
            }
            const cleanText = extractionResult.extractedText.trim();
             if (!cleanText) {
                throw new Error("No readable text content found after extraction.");
            }

            // 2. Chunk text
            await docRef.update({ indexingStatus: 'processing', indexingError: 'Chunking text...' });
            const chunks = simpleSplitter(cleanText);

            // 3. Write chunks to the kb_chunks collection for the Vertex AI extension to process
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

            // 4. Final success update
            await docRef.update({
                indexingStatus: 'success',
                indexingError: null,
                chunksWritten: chunks.length,
                indexedAt: FieldValue.serverTimestamp(),
            });

            console.log(`Successfully processed and indexed ${sourceName}.`);

        } catch (error: any) {
            console.error("Error processing knowledge base upload:", error);
            try {
                await docRef.update({
                    indexingStatus: 'failed',
                    indexingError: error.message || "An unknown error occurred in the backend function.",
                });
            } catch (updateError) {
                console.error("CRITICAL: Failed to write failure status back to Firestore.", updateError);
            }
        }
    });
