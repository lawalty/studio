
/**
 * @fileOverview Firebase Admin SDK Initialization
 *
 * This file provides a centralized, server-side-only mechanism for initializing
 * the Firebase Admin SDK. It ensures that the SDK is initialized only once
 * in the application's lifecycle (singleton pattern), which is a best practice
 * for serverless environments like Next.js on Firebase App Hosting.
 *
 * The exported `db` instance can be safely imported and used in any server-side
 * code (e.g., Genkit flows) to interact with Firestore with proper authentication.
 */

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Check if the app is already initialized to prevent errors
if (admin.apps.length === 0) {
  // When running in a Google Cloud environment (like App Hosting),
  // the Admin SDK can automatically detect the service account credentials.
  admin.initializeApp();
}

const db = getFirestore();

export { db, admin };
