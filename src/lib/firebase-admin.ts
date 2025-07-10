/**
 * @fileOverview Centralized Firebase Admin SDK Initialization
 *
 * This file initializes the Firebase Admin SDK for the entire server-side
 * application. It ensures that the SDK is initialized only once.
 * It is configured to use a direct import of the service account key.
 */
import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// Directly import the service account key.
// IMPORTANT: The path is relative to the project root where the 'next' command is run.
// This is a more robust method than relying on environment variables for local development.
import serviceAccount from '../../../service-account-key.json';

if (admin.apps.length === 0) {
  try {
    // Cast the imported JSON to the type the Admin SDK expects.
    const credential = admin.credential.cert(serviceAccount as admin.ServiceAccount);
    
    admin.initializeApp({
      credential,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
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
