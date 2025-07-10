/**
 * @fileOverview Centralized Firebase Admin SDK Initialization
 *
 * This file initializes the Firebase Admin SDK for the entire server-side
 * application. It ensures that the SDK is initialized only once.
 * It is configured to use Application Default Credentials, which is the standard
 * for Google Cloud environments and local development with 'gcloud auth'.
 */
import * as admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// Initialize the Firebase Admin SDK.
// This is required for any server-side logic that interacts with Firebase services.
// It should only be called once per application instance.
if (admin.apps.length === 0) {
  try {
    // When running in a Google Cloud environment (like App Hosting) or locally
    // after authenticating with 'gcloud auth application-default login', the SDK
    // automatically finds the necessary credentials.
    // The storageBucket is a required piece of configuration for the SDK to initialize correctly.
    // Explicitly providing the projectId solves the "Failed to determine service account" error.
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
    console.log('[firebase-admin] Initialized with Application Default Credentials.');
  } catch (error: any) {
    console.error(
      '[firebase-admin] Firebase Admin SDK initialization error:',
      error.stack
    );
  }
}

const app = admin.app();
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { db, admin, auth, storage, app };
