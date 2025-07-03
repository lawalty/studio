
import { genkit, configureGenkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { firebase } from '@genkit-ai/firebase';
import { getFirestore } from 'firebase-admin/firestore';
import { admin } from '@/lib/firebase-admin';

// This flag ensures that Genkit is only initialized once per server instance.
let genkitInitialized = false;
// A cache for the API key so we don't hit Firestore on every single call.
let cachedApiKey: string | null = null;

// This function initializes Genkit with the required plugins. It uses a flag
// to ensure it only runs once, preventing re-initialization errors.
function initializeGenkit() {
    if (genkitInitialized) {
        return;
    }

    configureGenkit({
        plugins: [
            firebase(),
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
                        throw new Error('Google AI API key not found in Firestore or environment variables.');
                    } catch (error) {
                        console.error("CRITICAL: Failed to retrieve Google AI API key from Firestore.", error);
                        // Re-throwing the error to make it clear that the configuration is missing.
                        throw new Error('Application is not configured with a Google AI API key.');
                    }
                }
            }),
        ],
        logLevel: 'debug',
        enableTracingAndMetrics: true,
    });

    genkitInitialized = true;
}

// Initialize Genkit immediately when this module is loaded.
initializeGenkit();

// Export the globally configured `genkit` instance as `ai`.
// All other files should import and use this single object.
export { genkit as ai };
