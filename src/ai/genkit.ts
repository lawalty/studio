
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

/**
 * @fileOverview Genkit Configuration
 *
 * This file configures the Genkit AI instance for the application.
 *
 * This file NO LONGER includes the `firebase()` plugin, as it was causing
 * webpack issues by bundling server-only code for the client. Instead,
 * Firebase Admin SDK is initialized manually in each server flow/file that needs it.
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
    googleAI({
      // By REMOVING the 'location' parameter, we allow Genkit to dynamically choose the endpoint.
      // - If an API key is provided from Firestore in a flow, it will use the Google AI (Gemini) API.
      // - If no key is provided, it will use Application Default Credentials, which will
      //   target the Vertex AI API if the service account has the correct permissions.
    }),
    // The firebase() plugin has been removed to resolve build issues.
    // Firebase Admin SDK is now initialized manually where needed.
  ],
});
