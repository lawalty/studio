
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {firebase} from '@genkit-ai/firebase';

/**
 * @fileOverview Genkit Configuration
 *
 * This file configures the Genkit AI instance for the application.
 *
 * It includes the `firebase()` plugin, which is essential for server-side
 * Genkit flows to interact with Firebase services like Firestore. It handles
 * the initialization of the Firebase Admin SDK automatically.
 *
 * Authentication is handled automatically via Application Default Credentials (ADC).
 * The application's service account has been granted the "Vertex AI User" role
 * in the Google Cloud IAM settings, so no API keys are required here.
 *
 * For more details on service account permissions, see the IAM page in the Google Cloud Console.
 */


// This is the primary Genkit instance for all AI tasks, including
// generative chat, embeddings, and any other model interactions.
// The googleAI() plugin will automatically use the service account credentials
// when running in a Google Cloud environment (like Firebase App Hosting).
export const ai = genkit({
  plugins: [
    googleAI(),
    firebase(), // This plugin is crucial for Firestore integration in flows.
  ],
});
