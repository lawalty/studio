'use server';
/**
 * @fileOverview Centralized Firebase Admin SDK initialization.
 *
 * This file initializes the Firebase Admin SDK only once for the entire
 * server-side application instance. All other server-side files that need to
 * interact with Firebase services (like Firestore) should import the
 * initialized `admin` and `db` objects from this module.
 *
 * This pattern prevents re-initialization errors and race conditions
 * that can occur in a serverless environment like Firebase App Hosting.
 */
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  try {
    admin.initializeApp();
  } catch (error) {
    console.error('Firebase Admin initialization error', error);
  }
}

const db = admin.firestore();

export { admin, db };
