
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

function initializeClientApp(): FirebaseApp {
    if (getApps().length > 0) {
        return getApp();
    }
    
    // This new, more robust check provides a clear error message if any required
    // environment variable is missing, which is the likely cause of the error.
    const requiredVars = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    const missingVars = requiredVars.filter(key => !firebaseConfig[key as keyof typeof firebaseConfig]);

    if (missingVars.length > 0) {
        const missingVarNames = missingVars.map(key => `NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`);
        throw new Error(
            'CRITICAL: Client-side Firebase environment variables are missing. ' +
            `The following variables were not found in your .env.local file: [${missingVarNames.join(', ')}]. ` +
            'Please ensure your .env.local file is in the root directory and contains all required values. ' +
            'You MUST restart the dev server after making changes to this file.'
        );
    }

    // Critical check specifically for storageBucket format, as this causes silent hangs.
    if (firebaseConfig.storageBucket && !firebaseConfig.storageBucket.endsWith('.appspot.com')) {
        throw new Error(
            'CRITICAL: The NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET environment variable in your .env.local file is likely incorrect. ' +
            `It should be in the format 'your-project-id.appspot.com', but it is currently set to '${firebaseConfig.storageBucket}'. ` +
            'Please correct this and restart the dev server.'
        );
    }
    
    return initializeApp(firebaseConfig);
}

const app = initializeClientApp();
const auth = getAuth(app);
const storage = getStorage(app);
const db = getFirestore(app);

export { app, auth, storage, db };
