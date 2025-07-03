
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { firebase } from '@genkit-ai/firebase';
import { dotprompt } from 'genkit/dotprompt';
import { getFirestore } from 'firebase-admin/firestore';
import { admin } from '@/lib/firebase-admin';

// A cache for the API key so we don't hit Firestore on every single call.
let cachedApiKey: string | null = null;

async function getGoogleApiKey(): Promise<string> {
  if (cachedApiKey) {
    return cachedApiKey;
  }

  // Fallback to environment variable if available, which is useful for local testing.
  if (process.env.GOOGLE_AI_API_KEY) {
    cachedApiKey = process.env.GOOGLE_AI_API_KEY;
    return cachedApiKey;
  }

  // Otherwise, fetch from Firestore.
  try {
    const db = getFirestore(admin.app());
    const docRef = db.collection('configurations').doc('api_keys_config');
    const docSnap = await docRef.get();

    if (docSnap.exists()) {
      const data = docSnap.data();
      const apiKey = data?.googleAiApiKey;
      if (apiKey && typeof apiKey === 'string') {
        cachedApiKey = apiKey;
        return apiKey;
      }
    }
    throw new Error('API key not found in Firestore or environment variables.');
  } catch (error) {
    console.error("CRITICAL: Failed to retrieve Google AI API key.", error);
    // This will cause the flow to fail, but with a clear error in the logs.
    throw new Error('Application is not configured with a Google AI API key.');
  }
}

// This function now ensures that Genkit is configured with an explicit API key.
export async function getGenkitAi() {
  const apiKey = await getGoogleApiKey();

  // Updated to use the correct Genkit v1.x syntax.
  return genkit({
    plugins: [
      dotprompt(),
      firebase(),
      googleAI({ apiKey }), // Using explicit API key for robust authentication.
    ],
  });
}
