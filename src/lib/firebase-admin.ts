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
    // In a Google Cloud environment (like App Hosting), initializeApp()
    // with no arguments will automatically use the project's service account.
    // However, explicitly passing the projectId from the environment can prevent
    // "NOT_FOUND" errors if the automatic discovery process fails.
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT,
    });
  } catch (error) {
    console.error('Firebase Admin SDK initialization error:', error);
  }
}

const db = admin.firestore();

// We export the initialized db and the admin namespace.
export { db, admin };
