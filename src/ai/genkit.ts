
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {getFirestore} from 'firebase-admin/firestore';
import {admin} from '@/lib/firebase-admin';

// A cache for the API key so we don't hit Firestore on every single call.
let cachedApiKey: string | null = null;

// This is now the single, globally configured `genkit` instance.
// All other files will import and use this `ai` object.
export const ai = genkit({
  plugins: [
    googleAI({
      // The API key is provided as an async function. Genkit will call this
      // function to resolve the key when it's needed for an API call.
      // This allows us to fetch the key dynamically from Firestore.
      apiKey: async () => {
        // Use cached key if available
        if (cachedApiKey) {
          return cachedApiKey;
        }

        // 1. Try environment variable first (useful for local dev/testing).
        if (process.env.GOOGLE_AI_API_KEY) {
          cachedApiKey = process.env.GOOGLE_AI_API_KEY;
          return cachedApiKey;
        }

        // 2. If not found, fetch from Firestore.
        try {
          const db = getFirestore(admin.app());
          const docRef = db.collection('configurations').doc('api_keys_config');
          const docSnap = await docRef.get();

          if (docSnap.exists()) {
            const data = docSnap.data();
            const apiKeyFromDb = data?.googleAiApiKey;
            if (apiKeyFromDb && typeof apiKeyFromDb === 'string') {
              cachedApiKey = apiKeyFromDb; // Cache the key
              return apiKeyFromDb;
            }
          }
          // If the key is not in Firestore, throw an error.
          throw new Error(
            'Google AI API key not found in Firestore or environment variables.'
          );
        } catch (error) {
          console.error(
            'CRITICAL: Failed to retrieve Google AI API key from Firestore.',
            error
          );
          // Re-throwing the error to make it clear that the configuration is missing.
          throw new Error('Application is not configured with a Google AI API key.');
        }
      },
    }),
  ],
  // These are configured automatically in Genkit 1.x and do not need to be set here.
  // logLevel: 'debug',
  // enableTracingAndMetrics: true,
});
