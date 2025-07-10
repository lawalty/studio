
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

// Check for missing environment variables. This provides a clear error message
// if the developer has not configured their .env.local file correctly.
const missingVars = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

if (missingVars.length > 0 && typeof window !== 'undefined') {
    const errorMessage = `CRITICAL: The following client-side Firebase environment variables are missing: ${missingVars.join(', ')}. 
- Please ensure your .env.local file is in the root directory of the project.
- Please verify the variable names in .env.local match the required names exactly.
- After creating or editing the file, you MUST restart the 'npm run dev' server.`;
    
    // Throw a specific, helpful error that will be visible to the developer.
    throw new Error(errorMessage);
}


// Initialize Firebase App
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const auth = getAuth(app);
const storage = getStorage(app);
const db = getFirestore(app);

export { app, auth, storage, db };
