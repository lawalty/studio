/**
 * @fileOverview Centralized Firebase Admin SDK Initialization
 *
 * This file initializes the Firebase Admin SDK for the entire server-side
 * application. It ensures that the SDK is initialized only once.
 * It is configured to use Application Default Credentials for both local
 * development and deployed environments.
 */
import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// A function to check if we are in a Google Cloud-managed environment.
const isGcp = () => !!(process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT);

if (admin.apps.length === 0) {
  try {
    // By calling initializeApp() without arguments, the SDK automatically
    // uses Application Default Credentials. In local development, this
    // uses the credentials from 'gcloud auth application-default login'.
    // In a deployed App Hosting environment, it uses the app's service account.
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || 'ai-blair-v4',
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'ai-blair-v4.appspot.com',
    });
  } catch (error: any) {
    // This enhanced error handling provides specific, actionable advice
    // if the Admin SDK fails to initialize, which is almost always a
    // credentialing problem in local development.
    if (!isGcp() && (error.message.includes('Could not find') || error.message.includes('ADC'))) {
         console.error(`
        ================================================================================
        CRITICAL: FIREBASE ADMIN SDK INITIALIZATION FAILED
        ================================================================================
        This is a common issue in local development. The server cannot find your
        Application Default Credentials.

        To fix this, please run the following command in your terminal:

            gcloud auth application-default login

        After running the command and authenticating, you MUST restart your
        development server for the changes to take effect.

        See the README.md file for more information.
        --------------------------------------------------------------------------------
        Original Error: ${error.stack}
        ================================================================================
      `);
    } else {
        console.error(
          '[firebase-admin] Firebase Admin SDK initialization error:',
          error.stack
        );
    }
    // Re-throw the error to prevent the app from starting in a broken state.
    throw new Error('Failed to initialize Firebase Admin SDK. See server logs for details.');
  }
}

const app = admin.app();
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { db, admin, auth, storage, app };
