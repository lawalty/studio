/**
 * @fileOverview Centralized Firebase Admin SDK Initialization
 *
 * This file initializes the Firebase Admin SDK for the entire server-side
 * application. It ensures that the SDK is initialized only once.
 * It is configured to use a direct import of the service account key.
 */
import * as admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { ServiceAccount } from 'firebase-admin';

// This function safely parses the service account key from the environment variable.
const getServiceAccount = (): ServiceAccount | undefined => {
  const serviceAccountString = process.env.SERVICE_ACCOUNT_KEY;
  if (!serviceAccountString) {
    console.error(
      '[firebase-admin] CRITICAL: SERVICE_ACCOUNT_KEY environment variable is not set.' +
      ' This JSON key is required for the server to authenticate with Firebase services.' +
      ' Please add it to your .env.local file and restart the server.'
    );
    return undefined;
  }
  try {
    return JSON.parse(serviceAccountString);
  } catch (e) {
    console.error(
      '[firebase-admin] CRITICAL: Failed to parse SERVICE_ACCOUNT_KEY. ' +
      'Please ensure it is a valid, single-line JSON string in your .env.local file.'
    );
    return undefined;
  }
};

if (admin.apps.length === 0) {
  try {
    const serviceAccount = getServiceAccount();
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
    } else {
        // Fallback for deployed environments like App Hosting where ADC is used.
        console.log("[firebase-admin] Initializing with Application Default Credentials.");
        admin.initializeApp({
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        });
    }
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
