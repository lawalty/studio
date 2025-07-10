/**
 * @fileOverview Centralized Firebase Admin SDK Initialization
 *
 * This file initializes the Firebase Admin SDK for the entire server-side
 * application. It ensures that the SDK is initialized only once, preventing
 * potential conflicts and errors from multiple initializations.
 *
 * Other server-side files should import the exported 'db', 'auth', and 'storage'
 * instances from this module instead of initializing their own.
 */
import * as admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';

// This check ensures that Firebase is only initialized once.
if (admin.apps.length === 0) {
  try {
    // For local development, it uses the service account credentials configured via
    // 'gcloud auth application-default login'. In a deployed App Hosting environment,
    // it automatically uses the app's service account.
    admin.initializeApp();
  } catch (error) {
    console.error('[firebase-admin] Firebase Admin SDK initialization error:', error);
    // You might want to throw the error or handle it in a way that
    // prevents the application from running with a misconfigured Admin SDK.
  }
}

const app = admin.apps[0]!;

const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

// We export the initialized clients and the admin namespace.
export { db, admin, storage, auth };
