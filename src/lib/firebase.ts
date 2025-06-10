
import { initializeApp, getApp, getApps, type FirebaseOptions } from "firebase/app";
import { getStorage } from "firebase/storage";

// TODO: Replace with your actual Firebase project configuration
const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyBz0edyk760wi-cssGZ7l0ipTpeDr9G9eQ",
  authDomain: "ai-blair-7fb8o.firebaseapp.com",
  projectId: "ai-blair-7fb8o",
  storageBucket: "ai-blair-7fb8o.firebasestorage.app",
  messagingSenderId: "513112805900",
  appId: "1:513112805900:web:9a6f209b3f3ab00fb31429"
};

// Initialize Firebase
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const storage = getStorage(app);

export { app, storage };
