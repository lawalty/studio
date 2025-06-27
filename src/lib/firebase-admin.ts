
/**
 * @fileOverview Firebase Admin SDK Initialization
 *
 * This file provides a centralized, server-side-only mechanism for initializing
 * the Firebase Admin SDK. It ensures that the SDK is initialized only once
 * in the application's lifecycle (singleton pattern), which is a best practice
 * for serverless environments like Next.js on Firebase App Hosting.
 *
 * The initialized SDK can then be used by other server-side modules.
 */

import * as admin from 'firebase-admin';

// Check if the app is already initialized to prevent errors
if (admin.apps.length === 0) {
  // When running in a Google Cloud environment (like App Hosting),
  // the Admin SDK can automatically detect the service account credentials.
  admin.initializeApp();
}
