
'use server';
import { genkit, type Genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { db } from '@/lib/firebase-admin';

const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";

// Cached instance of the Genkit AI object
let aiInstance: Genkit | null = null;

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
export async function getGenkitAi(): Promise<Genkit> {
  // Return the cached instance if it already exists.
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
    
    // Configure Genkit with the API key from Firestore
    const newAiInstance = genkit({
      plugins: [
        googleAI({ apiKey: apiKey }),
      ],
      // In-memory tracing for simplicity.
      // For production, you might configure a persistent trace store.
    });

    // Cache the new instance
    aiInstance = newAiInstance;

    return aiInstance;

  } catch (error) {
    console.error("[getGenkitAi] FATAL: Failed to initialize Genkit AI with key from Firestore:", error);
    // This re-throws the error, which will cause the calling flow to fail.
    // This is important for stopping execution if the AI cannot be configured.
    throw new Error(`Failed to configure Genkit: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
