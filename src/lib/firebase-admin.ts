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
    // Initialize with arguments, including the storageBucket. This resolves
    // issues where the Admin SDK cannot automatically determine the bucket,
    // which is common in various environments. The values are read from
    // process.env, which are set via .env.local or App Hosting secrets.
    admin.initializeApp({
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  } catch (error) {
    console.error('[firebase-admin] Firebase Admin SDK initialization error:', error);
    // You might want to throw the error or handle it in a way that
    // prevents the application from running with a misconfigured Admin SDK.
  }
}

const db = admin.firestore();

// We export the initialized db and the admin namespace.
export { db, admin };
