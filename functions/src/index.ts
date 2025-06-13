
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
// pdf-parse is a CommonJS module. With "esModuleInterop": true in tsconfig.json,
// this import style should work.
import pdf from 'pdf-parse';

// Initialize Firebase Admin SDK only once
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const storageAdmin = admin.storage(); // Renamed to avoid conflict

const TARGET_FOLDERS = [
    'knowledge_base_files_high_v1/',
    'knowledge_base_files_medium_v1/',
    'knowledge_base_files_low_v1/',
    'knowledge_base_files_archive_v1/',
];

export const extractTextFromPdf = functions
  .runWith({ timeoutSeconds: 300, memory: '1GB' }) // Increased timeout to 5 mins and memory
  .storage.object()
  .onFinalize(async (object: functions.storage.ObjectMetadata) => { // Explicitly typed 'object'
    const filePath = object.name;
    const contentType = object.contentType;
    const bucketName = object.bucket;

    // Validate file path
    if (!filePath) {
        functions.logger.warn('[extractTextFromPdf] File path is undefined. Skipping processing.');
        return null;
    }

    // Check if the file is in one of the target folders
    const isInTargetFolder = TARGET_FOLDERS.some(folder => filePath.startsWith(folder));
    if (!isInTargetFolder) {
        functions.logger.log(`[extractTextFromPdf] File ${filePath} is not in a target folder. Skipping.`);
        return null;
    }

    // Check if the file is a PDF by extension (case-insensitive)
    if (!filePath.toLowerCase().endsWith('.pdf')) {
        functions.logger.log(`[extractTextFromPdf] File ${filePath} is not a PDF based on extension. Skipping.`);
        return null;
    }

    // 1. Verify contentType
    if (contentType !== 'application/pdf') {
        functions.logger.warn(`[extractTextFromPdf] File ${filePath} has contentType ${contentType}, expected 'application/pdf'. Skipping.`);
        return null;
    }

    functions.logger.log(`[extractTextFromPdf] Processing PDF file: gs://${bucketName}/${filePath}`);

    // Extract filename without extension to use as document ID
    const pathSegments = filePath.split('/');
    const fileNameWithExtension = pathSegments.pop();

    if (!fileNameWithExtension) {
        functions.logger.error(`[extractTextFromPdf] Could not extract filename from path: ${filePath}.`);
        return null;
    }

    const lastDotIndex = fileNameWithExtension.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) {
        functions.logger.error(`[extractTextFromPdf] Could not determine valid filename without extension for: ${fileNameWithExtension}. File path: ${filePath}`);
        return null;
    }
    const documentId = fileNameWithExtension.substring(0, lastDotIndex);
    functions.logger.log(`[extractTextFromPdf] Determined documentId for Firestore 'sources' collection: '${documentId}' for file: ${filePath}`);


    try {
        const bucket = storageAdmin.bucket(bucketName); // Use renamed storageAdmin
        const fileRef = bucket.file(filePath);

        const [pdfBuffer] = await fileRef.download();
        functions.logger.log(`[extractTextFromPdf] Successfully downloaded ${filePath}. Buffer size: ${pdfBuffer.length} bytes.`);

        const data = await pdf(pdfBuffer);
        const extractedText = data.text;
        functions.logger.log(`[extractTextFromPdf] Successfully extracted text from ${filePath}. Text length: ${extractedText.length} characters.`);

        const docRef = db.collection('sources').doc(documentId);
        functions.logger.log(`[extractTextFromPdf] Attempting to write extracted text to Firestore path: sources/${documentId}`);
        
        await docRef.set({
            extractedText: extractedText,
            originalFilePath: filePath, // Good to store for reference
            lastProcessed: admin.firestore.FieldValue.serverTimestamp(),
            extractionStatus: 'success'
        }, { merge: true }); // Use set with merge to create or update

        functions.logger.log(`[extractTextFromPdf] Successfully created/updated Firestore document 'sources/${documentId}' with extracted text.`);
        return null;

    } catch (error) {
        let errorMessage = 'Unknown error during PDF processing.';
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
        // Log the full error object for more details, especially if it's not a standard Error instance
        functions.logger.error(`[extractTextFromPdf] Error processing file ${filePath}:`, errorMessage, error);
        
        if (documentId) { // Only try to log error if documentId is valid
            try {
                const docRef = db.collection('sources').doc(documentId);
                functions.logger.log(`[extractTextFromPdf] Attempting to write error status to Firestore path: sources/${documentId}`);
                await docRef.set({ // Use set with merge here as well
                    originalFilePath: filePath, // Log original path even on error
                    extractionError: errorMessage,
                    extractionStatus: 'failed',
                    lastProcessed: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                functions.logger.log(`[extractTextFromPdf] Logged extraction error to Firestore for 'sources/${documentId}'.`);
            } catch (dbError) { 
                let dbErrorMessage = 'Unknown database error during error logging.';
                if (dbError instanceof Error) {
                    dbErrorMessage = dbError.message;
                } else if (typeof dbError === 'string') {
                    dbErrorMessage = dbError;
                }
                functions.logger.error(`[extractTextFromPdf] Failed to log extraction error to Firestore for 'sources/${documentId}':`, dbErrorMessage, dbError);
            }
        }
        return null;
    }
});
