
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import pdf from 'pdf-parse'; // pdf-parse is a CommonJS module.

// Initialize Firebase Admin SDK only once
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const storageAdmin = admin.storage();

const TARGET_FOLDERS = [
    'knowledge_base_files_high_v1/',
    'knowledge_base_files_medium_v1/',
    'knowledge_base_files_low_v1/',
    'knowledge_base_files_archive_v1/',
];

/**
 * Extracts text from a PDF file uploaded to Cloud Storage and saves it to Firestore.
 * Triggered when a new object is finalized in a Cloud Storage bucket.
 * This function processes PDFs from specified target folders, extracts their text content,
 * and stores it in a 'sources' collection in Firestore, along with metadata
 * about the extraction process.
 *
 * @param {functions.storage.ObjectMetadata} object The Cloud Storage object metadata,
 *     containing details like the file path, content type, and bucket.
 * @param {functions.EventContext} context The event context.
 * @return {Promise<null>} A promise that resolves to null when processing is complete,
 *     or if the file is not applicable for processing.
 */
export const extractTextFromPdf = functions
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .storage.object()
  .onFinalize(async (object: functions.storage.ObjectMetadata): Promise<null> => {
    const filePath = object.name;
    const contentType = object.contentType;
    const bucketName = object.bucket;

    if (!filePath) {
        functions.logger.warn('[extractTextFromPdf] File path is undefined. Skipping processing.');
        return null;
    }

    const isInTargetFolder = TARGET_FOLDERS.some(folder => filePath.startsWith(folder));
    if (!isInTargetFolder) {
        functions.logger.log(`[extractTextFromPdf] File ${filePath} is not in a target folder. Skipping.`);
        return null;
    }

    if (!filePath.toLowerCase().endsWith('.pdf')) {
        functions.logger.log(`[extractTextFromPdf] File ${filePath} is not a PDF based on extension. Skipping.`);
        return null;
    }

    if (contentType !== 'application/pdf') {
        functions.logger.warn(`[extractTextFromPdf] File ${filePath} has contentType ${contentType}, expected 'application/pdf'. Skipping.`);
        return null;
    }

    functions.logger.log(`[extractTextFromPdf] Processing PDF file: gs://${bucketName}/${filePath}`);

    const pathSegments = filePath.split('/');
    const fileNameWithExtension = pathSegments.pop();

    if (!fileNameWithExtension) {
        functions.logger.error(`[extractTextFromPdf] Could not extract filename from path: ${filePath}.`);
        return null;
    }

    const lastDotIndex = fileNameWithExtension.lastIndexOf('.');
    let documentId: string | null = null;
    if (lastDotIndex === -1 || lastDotIndex === 0) {
        functions.logger.error(`[extractTextFromPdf] Could not determine valid filename without extension for: ${fileNameWithExtension}. File path: ${filePath}`);
    } else {
        documentId = fileNameWithExtension.substring(0, lastDotIndex);
    }
    
    if (!documentId) {
        functions.logger.error(`[extractTextFromPdf] Final documentId is null or empty for file: ${filePath}. Cannot process further for Firestore source writing.`);
        return null;
    }
    functions.logger.log(`[extractTextFromPdf] Determined documentId for Firestore 'sources' collection: '${documentId}' for file: ${filePath}`);

    try {
        const bucket = storageAdmin.bucket(bucketName);
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
            originalFilePath: filePath,
            lastProcessed: admin.firestore.FieldValue.serverTimestamp(),
            extractionStatus: 'success'
        }, { merge: true });

        functions.logger.log(`[extractTextFromPdf] Successfully created/updated Firestore document 'sources/${documentId}' with extracted text.`);
        return null;

    } catch (error) {
        let errorMessage = 'Unknown error during PDF processing.';
        let errorDetails: string = '';
        const unknownError = error as any;

        if (error instanceof Error) {
            errorMessage = error.message;
            errorDetails = error.stack || JSON.stringify(error);
        } else if (typeof error === 'string') {
            errorMessage = error;
            errorDetails = 'Error is a string type.';
        } else {
            errorMessage = String(unknownError?.message || 'Undetermined error structure during PDF processing.');
            errorDetails = JSON.stringify(error);
        }
        
        functions.logger.error(`[extractTextFromPdf] Error processing file ${filePath}: ${errorMessage}`, {details: errorDetails, originalErrorObj: error});
        
        if (documentId) {
            try {
                const docRef = db.collection('sources').doc(documentId);
                functions.logger.log(`[extractTextFromPdf] Attempting to write error status to Firestore path: sources/${documentId}`);
                await docRef.set({
                    originalFilePath: filePath,
                    extractionError: errorMessage,
                    extractionStatus: 'failed',
                    lastProcessed: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                functions.logger.log(`[extractTextFromPdf] Logged extraction error to Firestore for 'sources/${documentId}'.`);
            } catch (dbError) { 
                let dbErrorMessage = 'Unknown database error during error logging.';
                let dbErrorDetails: string = '';
                const unknownDbError = dbError as any;

                if (dbError instanceof Error) {
                    dbErrorMessage = dbError.message;
                    dbErrorDetails = dbError.stack || JSON.stringify(dbError);
                } else if (typeof dbError === 'string') {
                   dbErrorMessage = dbError;
                   dbErrorDetails = 'DB Error is a string type.';
                } else {
                    dbErrorMessage = String(unknownDbError?.message || 'Undetermined error structure during DB error logging.');
                    dbErrorDetails = JSON.stringify(dbError);
                }
                functions.logger.error(`[extractTextFromPdf] Failed to log extraction error to Firestore for 'sources/${documentId}': ${dbErrorMessage}`, {details: dbErrorDetails, originalDbErrorObj: dbError});
            }
        }
        return null;
    }
});
