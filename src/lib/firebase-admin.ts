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
import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// For local development, you must create a .env.local file and add the
// SERVICE_ACCOUNT_KEY environment variable.
// 1. Go to Firebase Console > Project Settings > Service accounts.
// 2. Click "Generate new private key". A JSON file will be downloaded.
// 3. Open the JSON file, copy the entire content, and paste it as the value for
//    SERVICE_ACCOUNT_KEY in your .env.local file.
//    It should look like: SERVICE_ACCOUNT_KEY='{"type": "service_account", ...}'
const serviceAccount = process.env.SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.SERVICE_ACCOUNT_KEY)
  : undefined;

if (admin.apps.length === 0) {
  try {
    admin.initializeApp({
      credential: serviceAccount
        ? admin.credential.cert(serviceAccount)
        : undefined, // In production (App Hosting), it will use Application Default Credentials.
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  } catch (error) {
    console.error(
      '[firebase-admin] Firebase Admin SDK initialization error:',
      error
    );
  }
}

const app = admin.app();
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { db, admin, storage, auth };