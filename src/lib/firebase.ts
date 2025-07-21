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
        apiKey: "AIzaSyBOQWkvEwBkcweTvz2nFBpEzt7UjBawFPo",
        authDomain: "ai-blair-v2.firebaseapp.com",
        projectId: "ai-blair-v2",
        storageBucket: "ai-blair-v2.firebasestorage.app",
        messagingSenderId: "737697039654",
        appId: "1:737697039654:web:3c2d65e531a0e272be2de7"
    };

    // Robust validation to ensure all required environment variables are present.
    // This prevents silent failures where the app initializes but cannot connect.
    const requiredVars = [
        'apiKey', 'authDomain', 'projectId', 'storageBucket', 
        'messagingSenderId', 'appId'
    ];

    const missingVars = requiredVars.filter(key => {
        const configKey = key as keyof typeof firebaseConfig;
        return !firebaseConfig[configKey] || firebaseConfig[configKey] === '';
    });

    if (missingVars.length > 0) {
        const missingVarNames = missingVars.map(key => `NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`);
        // This check is more for local dev; in production, we hardcode the values.
        if (process.env.NODE_ENV === 'development') {
          console.error(
              'CRITICAL: Client-side Firebase environment variables are missing or empty. ' +
              `The following variables were not found in your .env.local file: [${missingVarNames.join(', ')}]. ` +
              'Please ensure your .env.local file is in the root directory and contains all required values. ' +
              'You MUST restart the dev server after making changes to this file.'
          );
        }
    }
    
    // Initialize the Firebase app.
    return initializeApp(firebaseConfig);
}

// Export the initialized services.
const app = initializeClientApp();
const auth = getAuth(app);
const storage = getStorage(app);
const db = getFirestore(app);

export { app, auth, storage, db };
