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
    // For deployed environments (like App Hosting), GCLOUD_PROJECT is set automatically.
    // For local development, we fall back to the public project ID from the .env.local file.
    // This ensures the server-side SDK connects to the same project as the client-side SDK.
    const projectId = process.env.GCLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (!projectId) {
      // This is a final fallback. If Application Default Credentials (ADC) are configured, it might work.
      // If not, it will likely fail, but the developer has been warned.
      console.warn("[firebase-admin] Project ID not found in GCLOUD_PROJECT or NEXT_PUBLIC_FIREBASE_PROJECT_ID. Attempting to initialize without an explicit project ID. If this fails, ensure one of these environment variables is set or ADC is configured.");
      admin.initializeApp();
    } else {
      admin.initializeApp({
        projectId: projectId,
      });
    }
  } catch (error) {
    console.error('Firebase Admin SDK initialization error:', error);
  }
}

const db = admin.firestore();

// We export the initialized db and the admin namespace.
export { db, admin };