
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK only once
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const TARGET_FOLDERS = [
  'knowledge_base_files_high_v1/',
  'knowledge_base_files_medium_v1/',
  'knowledge_base_files_low_v1/',
  'knowledge_base_files_archive_v1/',
];

/**
 * @fileOverview Cloud Function for Firebase.
 * This function (extractTextFromPdf) is now a placeholder. PDF text extraction
 * has been moved to a Genkit flow called from the client-side admin panel.
 * This function can be further simplified or removed if no other onFinalize
 * triggers are needed for Storage objects.
 *
 * @param {functions.storage.ObjectMetadata} object The Cloud Storage object metadata.
 * @return {Promise<null>} A promise that resolves to null.
 */
export const extractTextFromPdf = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' }) // Reduced resources
  .storage.object()
  .onFinalize(async (object: functions.storage.ObjectMetadata): Promise<null> => {
    const filePath = object.name;
    const contentType = object.contentType;

    if (!filePath) {
      functions.logger.info('[extractTextFromPdf - Placeholder] File path is undefined. Skipping processing.');
      return null;
    }

    const isInTargetFolder = TARGET_FOLDERS.some(folder => filePath.startsWith(folder));
    if (!isInTargetFolder) {
      functions.logger.info(`[extractTextFromPdf - Placeholder] File ${filePath} is not in a target folder. Skipping.`);
      return null;
    }

    if (contentType === 'application/pdf') {
      functions.logger.info(
        `[extractTextFromPdf - Placeholder] PDF file ${filePath} detected. ` +
        'Text extraction is now primarily handled client-side via a Genkit flow after upload. ' +
        'This function serves as a basic trigger log or for any other potential onFinalize ' +
        'actions not related to direct text parsing here.'
      );
      // Future: Could add a flag to the PDF's metadata in Firestore here if needed,
      // e.g., { needs_verification: true }, if some backend check is still desired.
      // For now, all primary extraction logic is client-initiated.
    } else {
      functions.logger.info(
        `[extractTextFromPdf - Placeholder] Non-PDF file ${filePath} detected ` +
        `(contentType: ${contentType}). No specific action taken by this placeholder function.`
      );
    }

    // This function no longer performs text extraction or writes to the 'sources' collection.
    // That logic is now handled by a Genkit flow called from the admin panel.
    // This function is kept to maintain the deployment structure and can be removed
    // if no other on-object-finalize logic is required from Cloud Functions.

    return null;
  });
