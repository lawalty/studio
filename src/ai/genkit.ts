import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";

/**
 * Dynamically retrieves the Gemini API key.
 * This function now implements a fallback mechanism for easier debugging.
 *
 * 1. (Recommended for Debugging) It first checks for a `GEMINI_API_KEY`
 *    environment variable, typically loaded from a `.env.local` file.
 * 2. If the environment variable is not found, it falls back to fetching
 *    the key from the 'gemini' field in the Firestore document at
 *    `configurations/api_keys_config`.
 */
async function getGeminiApiKey(): Promise<string | undefined> {
  // 1. Check for environment variable (best for local debugging)
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey.trim() !== '') {
    const key = envKey.trim();
    console.log(`[Genkit] Using Gemini Key from environment variable. Starts with: ${key.substring(0, 4)}, Ends with: ${key.substring(key.length - 4)}`);
    return key;
  }
  console.log('[Genkit] No GEMINI_API_KEY environment variable found. Checking Firestore...');

  // 2. Fallback to Firestore
  try {
    const docRef = doc(db, FIRESTORE_KEYS_PATH);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const firestoreKey = docSnap.data()?.gemini;
      if (firestoreKey && firestoreKey.trim() !== '') {
        const key = firestoreKey.trim();
        console.log(`[Genkit] Found Gemini Key in Firestore. Starts with: ${key.substring(0, 4)}, Ends with: ${key.substring(key.length - 4)}`);
        return key;
      } else {
        console.warn("[Genkit] Gemini API key is empty or not found in the Firestore document.");
        return undefined;
      }
    } else {
      console.warn("[Genkit] API keys configuration document does not exist in Firestore.");
      return undefined;
    }
  } catch (error) {
    console.error("[Genkit] Critical error fetching Gemini API key from Firestore:", error);
    return undefined;
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
