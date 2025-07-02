'use server';
/**
 * @fileOverview Dynamic Genkit Configuration
 *
 * This file dynamically configures the Genkit AI instance for the application.
 * It fetches the Google AI API key from Firestore at runtime. This is crucial
 * for production environments where .env files are not deployed.
 *
 * The getGenkitAi function initializes Genkit with the fetched key
 * and caches the instance for subsequent calls to improve performance.
 */

import { genkit, type Genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK only if it hasn't been already.
if (admin.apps.length === 0) {
  try {
    admin.initializeApp();
  } catch (error) {
    console.error('Firebase Admin initialization error in genkit.ts', error);
  }
}
const db = admin.firestore();

const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";
let aiInstance: Genkit | null = null;
const ai = genkit({
  plugins: [
    googleAI(),
  ],
});
export default ai;

export async function getGenkitAi(): Promise<Genkit> {
  if (aiInstance) {
    return aiInstance;
  }

  try {
    const docRef = db.doc(FIRESTORE_KEYS_PATH);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new Error("API keys configuration not found in Firestore. Please configure it in the admin panel.");
    }

    const configData = docSnap.data();
    const apiKey = configData?.googleAiApiKey;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new Error("Google AI API Key is missing or invalid in Firestore configuration. Please add it in the admin panel.");
    }
    
    const newAiInstance = genkit({
      plugins: [
        googleAI({ apiKey: apiKey }),
      ],
    });

    aiInstance = newAiInstance;
    return aiInstance;

  } catch (error) {
    console.error("[getGenkitAi] FATAL: Failed to initialize Genkit AI with key from Firestore:", error);
    // Fallback to the default instance if Firestore fetch fails
    return ai;
  }
}
