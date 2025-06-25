
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";

/**
 * Dynamically retrieves the Gemini API key from Firestore.
 * This allows the key to be managed from the admin panel.
 * It no longer falls back to environment variables to ensure the user-provided key is the sole source.
 */
async function getGeminiApiKey(): Promise<string | undefined> {
  try {
    const docRef = doc(db, FIRESTORE_KEYS_PATH);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const firestoreKey = docSnap.data()?.gemini;
      if (firestoreKey && firestoreKey.trim() !== '') {
        const key = firestoreKey.trim();
        // Log the sanitized key for debugging purposes
        console.log(`[Genkit] Found Gemini Key in Firestore. Starts with: ${key.substring(0, 4)}, Ends with: ${key.substring(key.length - 4)}`);
        return key;
      } else {
        // Document exists, but the key is empty or missing
        console.warn("[Genkit] Gemini API key is empty or not found in the Firestore document. An API key must be configured in the admin panel.");
        return undefined;
      }
    } else {
      // The configuration document itself does not exist
      console.warn("[Genkit] API keys configuration document does not exist in Firestore. An API key must be configured in the admin panel.");
      return undefined;
    }
  } catch (error) {
    // A critical error occurred trying to read from Firestore
    console.error("[Genkit] Critical error fetching Gemini API key from Firestore. Cannot proceed with authenticated calls. Error:", error);
    return undefined;
  }
}

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: getGeminiApiKey(), // Pass the promise that resolves to the key
    })
  ],
  model: 'googleai/gemini-1.5-flash-latest',
});
