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
    // Prioritize the standard GCLOUD_PROJECT for server-side environments,
    // falling back to the public one for local/client-side contexts.
    const projectId = process.env.GCLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    
    if (!projectId) {
      // This error will be thrown if no project ID can be found.
      throw new Error("Could not determine Firebase Project ID. Ensure GCLOUD_PROJECT or NEXT_PUBLIC_FIREBASE_PROJECT_ID is set.");
    }

    console.log(`[firebase-admin] Initializing Firebase Admin SDK for project: ${projectId}`);

    admin.initializeApp({
      projectId: projectId,
    });
    
  } catch (error) {
    console.error('[firebase-admin] Firebase Admin SDK initialization error:', error);
  }
}

const db = admin.firestore();

// We export the initialized db and the admin namespace.
export { db, admin };
