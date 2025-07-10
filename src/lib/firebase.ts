
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

// The Firebase config is loaded from environment variables.
// See the README.md file for instructions on how to set this up.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Centralized function to get the Firebase app instance.
function getFirebaseApp(): FirebaseApp {
    if (getApps().length === 0) {
        // This check provides a clear error message if the developer has not
        // configured their .env.local file correctly.
        if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
            throw new Error(
                'CRITICAL: Client-side Firebase environment variables are missing. ' +
                'Please ensure your .env.local file is in the root directory and contains all ' +
                'NEXT_PUBLIC_FIREBASE_* variables. You MUST restart the dev server after changes.'
            );
        }
        return initializeApp(firebaseConfig);
    } else {
        return getApp();
    }
}

const app = getFirebaseApp();
const auth = getAuth(app);
const storage = getStorage(app);
const db = getFirestore(app);

export { app, auth, storage, db };
