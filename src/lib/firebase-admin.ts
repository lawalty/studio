/**
 * @fileOverview Centralized Firebase Admin SDK Initialization
 *
 * This file initializes the Firebase Admin SDK for the entire server-side
 * application. It ensures that the SDK is initialized only once.
 * It is configured to use Application Default Credentials (ADC).
 *
 * For local development, create a service account key JSON file and point to it
 * using the GOOGLE_APPLICATION_CREDENTIALS environment variable in `.env.local`.
 * For production on App Hosting, ADC is automatically configured.
 */
import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import path from 'path';

if (admin.apps.length === 0) {
  try {
    // For local development, use the service account key file specified in .env.local
    if (process.env.NODE_ENV !== 'production' && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const serviceAccountPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      const serviceAccount = require(serviceAccountPath);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
    } else {
      // For production on App Hosting, use Application Default Credentials.
      // The GOOGLE_APPLICATION_CREDENTIALS env var is not needed in this case.
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
