/**
 * @fileOverview Centralized Firebase Admin SDK Initialization
 *
 * This file initializes the Firebase Admin SDK for the entire server-side
 * application. It ensures that the SDK is initialized only once, preventing
 * potential conflicts and errors from multiple initializations.
 *
 * Other server-side files should import the exported 'db' and 'admin'
 * instances from this module instead of initializing their own.
 */
import * as admin from 'firebase-admin';

// This check ensures that Firebase is only initialized once.
if (admin.apps.length === 0) {
  try {
    // For local development, it uses the service account credentials configured via
    // 'gcloud auth application-default login'. In a deployed App Hosting environment,
    // it automatically uses the app's service account.
    // Explicitly providing the projectId from the environment variable ensures
    // the Admin SDK knows which project to connect to, resolving token creation errors.
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT,
    });
  } catch (error) {
    console.error('[firebase-admin] Firebase Admin SDK initialization error:', error);
    // You might want to throw the error or handle it in a way that
    // prevents the application from running with a misconfigured Admin SDK.
  }
}

const db = admin.firestore();
const storage = admin.storage();
const auth = admin.auth();

// We export the initialized db, storage, and the admin namespace.
export { db, admin, storage, auth };
