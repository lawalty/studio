
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

let app: FirebaseApp;

// Check if all required environment variables are present
const missingVars = Object.keys(firebaseConfig).filter(key => !(firebaseConfig as any)[key]);

if (missingVars.length > 0) {
    // This check will only run in the browser, where 'window' is defined.
    // It prevents server-side builds from failing but stops the client app from running in a broken state.
    if (typeof window !== 'undefined') {
        const errorMessage = `CRITICAL: The following client-side Firebase environment variables are missing: ${missingVars.join(', ')}. The application cannot function. Please see README.md for setup instructions in your .env.local file.`;
        console.error(errorMessage);
        // Throw an error to halt execution on the client, making the problem obvious.
        throw new Error(errorMessage);
    }
    // For server-side rendering during build, we create a dummy app object to avoid crashing the build process.
    app = {} as FirebaseApp;
} else {
    // If all variables are present, initialize Firebase. This ensures 'getApps()' runs only when it's safe.
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
}

const auth = getAuth(app);
const storage = getStorage(app);
const db = getFirestore(app);

export { app, auth, storage, db };
