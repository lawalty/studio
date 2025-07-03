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
    // Force initialization with the public project ID to ensure consistency
    // across all environments, preventing "NOT_FOUND" errors when the
    // server-side environment isn't automatically configured.
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    
    if (!projectId) {
      throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set in the environment.");
    }

    admin.initializeApp({
      projectId: projectId,
    });
    
  } catch (error) {
    console.error('Firebase Admin SDK initialization error:', error);
  }
}

const db = admin.firestore();

// We export the initialized db and the admin namespace.
export { db, admin };
