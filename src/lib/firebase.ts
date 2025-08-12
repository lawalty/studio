import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

// This function robustly initializes the client-side Firebase app,
// ensuring all necessary environment variables are present.
function initializeClientApp(): FirebaseApp {
    // Prevent re-initialization
    if (getApps().length > 0) {
        return getApp();
    }

    // Construct the config object inside the function to ensure freshest env vars.
    const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    // Robust validation to ensure all required environment variables are present.
    // This prevents silent failures where the app initializes but cannot connect.
    const requiredVars = Object.keys(firebaseConfig) as Array<keyof typeof firebaseConfig>;
    const missingVars = requiredVars.filter(key => !firebaseConfig[key]);

    if (missingVars.length > 0) {
        const missingVarNames = missingVars.map(key => `NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`);
        const errorMessage = 'CRITICAL: Client-side Firebase environment variables are missing or empty. ' +
            `The following variables were not found in your .env.local file: [${missingVarNames.join(', ')}]. ` +
            'Please ensure your .env.local file is in the root directory and contains all required values. ' +
            'You MUST restart the dev server after making changes to this file.';

        console.error(errorMessage);
        // This will prevent the app from rendering in a broken state
        throw new Error(errorMessage);
    }
    
    // Initialize the Firebase app.
    return initializeApp(firebaseConfig);
}

// Export the initialized services.
const app = initializeClientApp();
const auth = getAuth(app);
const storage = getStorage(app);
const db = getFirestore(app);

export { app, auth, db, storage };
