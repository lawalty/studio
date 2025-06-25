
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";

/**
 * Dynamically retrieves the Gemini API key from Firestore.
 * This allows the key to be managed from the admin panel.
 * Falls back to the GOOGLE_API_KEY environment variable if Firestore is unavailable or the key is not set.
 */
async function getGeminiApiKey(): Promise<string | undefined> {
  try {
    const docRef = doc(db, FIRESTORE_KEYS_PATH);
    const docSnap = await getDoc(docRef);

    // Check for a valid, non-empty key from Firestore first.
    const firestoreKey = docSnap.data()?.gemini;
    if (docSnap.exists() && firestoreKey && firestoreKey.trim() !== '') {
      return firestoreKey;
    }
    
    // If Firestore key is missing or empty, fall back to environment variable.
    // In many environments (like App Hosting), this will be the primary source.
    const envKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (envKey && envKey.trim() !== '') {
      return envKey;
    }

    // If no valid key is found in either source, return undefined.
    // The Genkit plugin will then fail with a clear "API key not valid" error from Google.
    return undefined;

  } catch (error) {
    console.error(
      "Could not fetch Gemini API key from Firestore. " +
      "Falling back to GOOGLE_API_KEY environment variable. Error:", 
      error
    );
    // On error, still try the environment variable as a last resort.
    return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  }
}

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: getGeminiApiKey(), // Pass the promise returned by the async function
    })
  ],
  model: 'googleai/gemini-1.5-flash-latest',
});
