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

    if (docSnap.exists() && docSnap.data()?.gemini) {
      return docSnap.data().gemini;
    }
    
    // Fallback to environment variable if not in Firestore.
    // In many environments (like App Hosting), this will be the primary source.
    return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

  } catch (error) {
    console.error(
      "Could not fetch Gemini API key from Firestore. " +
      "Falling back to GOOGLE_API_KEY environment variable. Error:", 
      error
    );
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
