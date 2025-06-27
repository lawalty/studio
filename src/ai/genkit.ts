
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {firebase} from '@genkit-ai/firebase';

/**
 * @fileOverview Genkit Configuration
 *
 * This file configures the Genkit AI instance for the application.
 *
 * It now RE-INCLUDES the `firebase()` plugin. This plugin is essential for
 * Genkit to properly integrate with the Firebase App Hosting environment,
 * automatically handling authentication contexts for Genkit's internal
 * operations (like tracing) and for Firebase Admin SDK usage in flows.
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
    firebase(), // The firebase() plugin is required for proper integration and auth.
    googleAI({
      // By REMOVING the 'location' parameter, we allow Genkit to dynamically choose the endpoint.
      // - If an API key is provided from Firestore in a flow, it will use the Google AI (Gemini) API.
      // - If no key is provided, it will use Application Default Credentials, which will
      //   target the Vertex AI API if the service account has the correct permissions.
    }),
  ],
  // Log all traces to the console for easier debugging.
  traceStore: 'firebase',
  // Allow a longer time for Genkit flows to run.
  flowStateStore: 'firebase',
});
