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
    // Check if the SERVICE_ACCOUNT_KEY environment variable is set.
    // This is the primary and more secure way for local development.
    if (process.env.SERVICE_ACCOUNT_KEY) {
      // Parse the stringified JSON service account key.
      const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);
      
      // Initialize the app with the service account credentials.
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
    } else {
      // For deployed environments (like App Hosting) or local setups using gcloud ADC,
      // initializeApp() will automatically use the available service account.
      admin.initializeApp({
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
    }
  } catch (error) {
    console.error('[firebase-admin] Firebase Admin SDK initialization error:', error);
    // Throwing the error can help prevent the app from running with a misconfigured SDK.
    throw error;
  }
}

const app = admin.apps[0]!;

const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

// We export the initialized clients and the admin namespace.
export { db, admin, storage, auth };