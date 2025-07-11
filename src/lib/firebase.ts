
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

// This function robustly initializes the client-side Firebase app.
function initializeClientApp(): FirebaseApp {
    // Prevent re-initialization
    if (getApps().length > 0) {
        return getApp();
    }

    //
    // CRITICAL FIX: Hardcoding the configuration from the Firebase console screenshot
    // to eliminate any issues with environment variables as a debugging step.
    //
    const firebaseConfig = {
      apiKey: "AIzaSyBz0edyk760w1-cssGZ7l0ipTpeDr9G9eQ",
      authDomain: "ai-blair-7fb8o.firebaseapp.com",
      projectId: "ai-blair-7fb8o",
      storageBucket: "ai-blair-7fb8o.firebasestorage.app",
      messagingSenderId: "513112805900",
      appId: "1:513112805900:web:9a6f209b3f3ab00fb31429"
    };
    
    // Initialize the Firebase app.
    return initializeApp(firebaseConfig);
}

// Export the initialized services.
const app = initializeClientApp();
const auth = getAuth(app);
const storage = getStorage(app);
const db = getFirestore(app);

export { app, auth, storage, db };
