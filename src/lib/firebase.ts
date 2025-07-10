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

const requiredVars = Object.keys(firebaseConfig);
const missingVars = requiredVars.filter(key => !(firebaseConfig as any)[key]);

let app: FirebaseApp;

if (missingVars.length > 0) {
  // If we are on the server during a build, this can be noisy.
  // In a browser environment, it's a critical error.
  if (typeof window !== 'undefined') {
    const errorMessage = `CRITICAL: The following client-side Firebase environment variables are missing: ${missingVars.join(', ')}. The application cannot function correctly. Please see README.md for setup instructions.`;
    console.error(errorMessage);
    // Throw an error to prevent the app from continuing in a broken state.
    throw new Error(errorMessage);
  }
  // If on the server, we can't initialize. The app object will be undefined,
  // which will cause errors if used, but prevents build-time crashes.
  // We'll rely on the browser check to catch the problem during development.
  app = {} as FirebaseApp; // Dummy object for server build
} else {
  // Initialize Firebase
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
}

const auth = getAuth(app);
const storage = getStorage(app);
const db = getFirestore(app);

export { app, auth, storage, db };
