
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
const storage = admin.storage();

const TARGET_FOLDERS = [
    'knowledge_base_files_high_v1/',
    'knowledge_base_files_medium_v1/',
    'knowledge_base_files_low_v1/',
    'knowledge_base_files_archive_v1/',
];

export const extractTextFromPdf = functions.storage.object().onFinalize(async (object) => {
    const filePath = object.name;
    const contentType = object.contentType;
    const bucketName = object.bucket;

    // Validate file path
    if (!filePath) {
        functions.logger.warn('File path is undefined. Skipping processing.');
        return null;
    }

    // Check if the file is in one of the target folders
    const isInTargetFolder = TARGET_FOLDERS.some(folder => filePath.startsWith(folder));
    if (!isInTargetFolder) {
        functions.logger.log(`File ${filePath} is not in a target folder. Skipping.`);
        return null;
    }

    // Check if the file is a PDF by extension (case-insensitive)
    if (!filePath.toLowerCase().endsWith('.pdf')) {
        functions.logger.log(`File ${filePath} is not a PDF based on extension. Skipping.`);
        return null;
    }

    // 1. Verify contentType
    if (contentType !== 'application/pdf') {
        functions.logger.warn(`File ${filePath} has contentType ${contentType}, expected 'application/pdf'. Skipping.`);
        return null;
    }

    functions.logger.log(`Processing PDF file: gs://${bucketName}/${filePath}`);

    // Extract filename without extension to use as document ID
    // e.g. "knowledge_base_files_high_v1/my-doc-123.pdf" -> "my-doc-123"
    const pathSegments = filePath.split('/');
    const fileNameWithExtension = pathSegments.pop();

    if (!fileNameWithExtension) {
        functions.logger.error(`Could not extract filename from path: ${filePath}.`);
        return null;
    }

    const lastDotIndex = fileNameWithExtension.lastIndexOf('.');
    // Ensure '.' is found and it's not the first character (e.g. '.hiddenfile.pdf')
    // and also that there's a name before the dot (e.g. not just '.pdf')
    if (lastDotIndex === -1 || lastDotIndex === 0) {
        functions.logger.error(`Could not determine valid filename without extension for: ${fileNameWithExtension}. File path: ${filePath}`);
        return null;
    }
    const documentId = fileNameWithExtension.substring(0, lastDotIndex);


    try {
        // 2. Download the PDF file from Storage
        const bucket = storage.bucket(bucketName);
        const fileRef = bucket.file(filePath);

        const [pdfBuffer] = await fileRef.download();
        functions.logger.log(`Successfully downloaded ${filePath}. Buffer size: ${pdfBuffer.length} bytes.`);

        // 3. Using pdf-parse, extract text content
        // The pdf-parse library expects a Buffer.
        const data = await pdf(pdfBuffer);
        const extractedText = data.text;
        functions.logger.log(`Successfully extracted text from ${filePath}. Text length: ${extractedText.length} characters.`);

        // 4. Connect to Firestore and find the document
        // 5. Update that specific Firestore document
        const docRef = db.collection('sources').doc(documentId);

        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            functions.logger.warn(`Firestore document 'sources/${documentId}' does not exist. Cannot update. This document was expected to correspond to file '${filePath}'.`);
            // If creation is desired when not found, one might use:
            // await docRef.set({ extractedText: extractedText, originalFilePath: filePath /* ... other fields ... */ });
            // functions.logger.log(`Created and updated Firestore document 'sources/${documentId}'.`);
            return null; // Current instruction is to "update", so non-existence means we stop.
        }
        
        await docRef.update({
            extractedText: extractedText,
            lastProcessed: admin.firestore.FieldValue.serverTimestamp(),
            extractionStatus: 'success'
        });

        functions.logger.log(`Successfully updated Firestore document 'sources/${documentId}' with extracted text.`);
        return null;

    } catch (error: any) {
        functions.logger.error(`Error processing file ${filePath}:`, error.message, error);
        // Optional: Update Firestore document with error status
        try {
            const docRef = db.collection('sources').doc(documentId);
            const docSnap = await docRef.get(); // Check existence before trying to update with error
            if (docSnap.exists) {
                 await docRef.update({
                    extractionError: error.message || 'Unknown error during PDF processing.',
                    extractionStatus: 'failed',
                    lastProcessed: admin.firestore.FieldValue.serverTimestamp()
                });
                functions.logger.log(`Logged extraction error to Firestore for 'sources/${documentId}'.`);
            } else {
                // If the documentId itself was problematic or the doc never existed, just log.
                 functions.logger.warn(`Document 'sources/${documentId}' not found, cannot log error status to it for file ${filePath}.`);
            }
        } catch (dbError: any) {
            functions.logger.error(`Failed to log extraction error to Firestore for 'sources/${documentId}':`, dbError.message, dbError);
        }
        return null;
    }
});
