
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";

/**
 * Dynamically retrieves the Gemini API key with robust error handling.
 * This function now implements a fallback mechanism for easier debugging and provides
 * clear error messages if the key cannot be found or retrieved.
 *
 * 1.  It first checks for a `GEMINI_API_KEY` environment variable.
 * 2.  If not found, it falls back to fetching the key from the 'gemini' field
 *     in the Firestore document at `configurations/api_keys_config`.
 * 3.  If the key is not found or is empty in Firestore, it throws an explicit error.
 *
 * @returns {Promise<string>} A promise that resolves to the Gemini API key.
 * @throws {Error} If the API key cannot be found in environment variables or Firestore.
 */
async function getGeminiApiKey(): Promise<string> {
  // 1. Check for environment variable (best for local debugging)
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey.trim() !== '') {
    const key = envKey.trim();
    console.log(`[Genkit] Using Gemini Key from environment variable.`);
    return key;
  }
  console.log('[Genkit] No GEMINI_API_KEY environment variable found. Checking Firestore...');

  // 2. Fallback to Firestore
  try {
    const docRef = doc(db, FIRESTORE_KEYS_PATH);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const firestoreKey = docSnap.data()?.gemini;
      if (firestoreKey && typeof firestoreKey === 'string' && firestoreKey.trim() !== '') {
        const key = firestoreKey.trim();
        console.log(`[Genkit] Found Gemini Key in Firestore.`);
        return key;
      } else {
        // Throw a specific error if the key is missing from the document
        throw new Error("Gemini API key is missing or empty in the Firestore document at 'configurations/api_keys_config'. Please set it in the admin panel's API Keys page.");
      }
    } else {
      // Throw a specific error if the document doesn't exist
      throw new Error("API keys configuration document does not exist in Firestore at 'configurations/api_keys_config'. Please configure your API keys in the admin panel.");
    }
  } catch (error: any) {
    // Re-throw specific, user-friendly errors, or a generic one for other issues.
    if (error.message.includes('configurations/api_keys_config')) {
        throw error;
    }
    console.error("[Genkit] Critical error fetching Gemini API key from Firestore:", error);
    throw new Error(`Failed to fetch Gemini API key from Firestore. Please check the database connection and permissions. Original error: ${error.message}`);
  }
}

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: getGeminiApiKey(),
    })
  ],
  model: 'googleai/gemini-1.5-flash-latest',
});
