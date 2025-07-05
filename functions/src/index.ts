
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK.
// This is required for any server-side logic that interacts with Firebase services.
// It should only be called once per application instance.
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// This file is the entry point for Cloud Functions for Firebase.
// Since all AI and data processing logic has been moved to Genkit flows
// called from the Next.js client, there are currently no active Cloud Functions
// defined here. This file is kept for the project structure and can be used
// to add new background functions in the future if needed.
