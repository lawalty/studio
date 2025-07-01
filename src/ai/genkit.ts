import { genkit, type Genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import * as admin from 'firebase-admin';

/**
 * @fileOverview Dynamic Genkit Configuration
 *
 * This file dynamically configures the Genkit AI instance for the application.
 * Instead of relying on a static GOOGLE_AI_API_KEY from .env.local,
 * this setup fetches the key from Firestore at runtime. This is crucial
 * for production environments where .env files are not deployed.
 *
 * The getGenkitAi function initializes Genkit with the fetched key
 * and caches the instance for subsequent calls to improve performance.
 */

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
    throw new Error(`Failed to configure Genkit: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
