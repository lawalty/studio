
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";

/**
 * Dynamically retrieves the Gemini API key for GENERATIVE models.
 * This function implements a fallback mechanism for easier debugging and provides
 * clear error messages if the key cannot be found or retrieved.
 *
 * 1.  It first checks for a `GEMINI_API_KEY` environment variable.
 * 2.  If not found, it falls back to fetching the key from Firestore at
 *     `configurations/api_keys_config` from the `geminiGenerative` field (with a fallback to the old `gemini` field).
 * 3.  If the key is not found, it throws an explicit error.
 *
 * @returns {Promise<string>} A promise that resolves to the Gemini API key.
 * @throws {Error} If the API key cannot be found.
 */
async function getGeminiGenerativeApiKey(): Promise<string> {
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey.trim() !== '') {
    console.log(`[Genkit] Using Generative Gemini Key from environment variable.`);
    return envKey.trim();
  }

  try {
    const docRef = doc(db, FIRESTORE_KEYS_PATH);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const firestoreKey = data?.geminiGenerative || data?.gemini; // Fallback for backwards compatibility
      if (firestoreKey && typeof firestoreKey === 'string' && firestoreKey.trim() !== '') {
        console.log(`[Genkit] Using Generative Gemini Key from Firestore.`);
        return firestoreKey.trim();
      }
    }
    throw new Error("Generative Gemini API key is missing. Please set it in the admin panel's API Keys page or as a GEMINI_API_KEY environment variable.");
  } catch (error: any) {
    console.error("[Genkit] Critical error fetching Generative Gemini API key:", error.message);
    throw new Error(`Failed to fetch Generative Gemini API key. Please check configurations. Original error: ${error.message}`);
  }
}


/**
 * Dynamically retrieves the Gemini API key for EMBEDDING models.
 * This function is similar to the generative key function but checks for an embedding-specific key first.
 *
 * 1.  It first checks for a `GEMINI_EMBEDDING_API_KEY` environment variable.
 * 2.  If not found, it falls back to fetching from the `geminiEmbedding` field in Firestore.
 * 3.  If the embedding-specific key is not found, it falls back to using the GENERATIVE key.
 *
 * @returns {Promise<string>} A promise that resolves to the appropriate Gemini API key for embeddings.
 * @throws {Error} If no suitable API key can be found.
 */
async function getGeminiEmbeddingApiKey(): Promise<string> {
    // 1. Check for embedding-specific environment variable.
    const envKey = process.env.GEMINI_EMBEDDING_API_KEY;
    if (envKey && envKey.trim() !== '') {
      console.log(`[Genkit] Using Embedding Gemini Key from environment variable.`);
      return envKey.trim();
    }
  
    // 2. Check for embedding-specific key in Firestore.
    try {
      const docRef = doc(db, FIRESTORE_KEYS_PATH);
      const docSnap = await getDoc(docRef);
  
      if (docSnap.exists()) {
        const firestoreKey = docSnap.data()?.geminiEmbedding;
        if (firestoreKey && typeof firestoreKey === 'string' && firestoreKey.trim() !== '') {
          console.log(`[Genkit] Using Embedding Gemini Key from Firestore.`);
          return firestoreKey.trim();
        }
      }
    } catch (error: any) {
       console.warn(`[Genkit] Could not fetch embedding key from Firestore, will use fallback. Error: ${error.message}`);
    }

    // 3. Fallback to the generative key.
    console.log('[Genkit] No embedding-specific key found. Falling back to the generative Gemini key for embeddings.');
    return getGeminiGenerativeApiKey();
}


// This is the primary Genkit instance for all GENERATIVE tasks (chat, summarization, etc.)
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: getGeminiGenerativeApiKey(),
    })
  ],
  model: 'googleai/gemini-1.5-flash-latest',
});


// This is a secondary Genkit instance configured specifically for EMBEDDING tasks.
export const embedderAi = genkit({
    plugins: [
      googleAI({
        apiKey: getGeminiEmbeddingApiKey(),
      })
    ],
});
