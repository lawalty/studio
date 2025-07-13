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

if (admin.apps.length === 0) {
  try {
    // By calling initializeApp() without arguments, the SDK automatically
    // uses Application Default Credentials. In local development, this
    // uses the credentials from 'gcloud auth application-default login'.
    // In a deployed App Hosting environment, it uses the app's service account.
    admin.initializeApp();
  } catch (error: any) {
    console.error(
      '[firebase-admin] Firebase Admin SDK initialization error:',
      error.stack
    );
    throw new Error('Failed to initialize Firebase Admin SDK. See server logs for details.');
  }
}

const app = admin.app();
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { db, admin, auth, storage, app };
