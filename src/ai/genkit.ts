
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
      // By specifying a location, we are explicitly telling Genkit to use
      // the Vertex AI API instead of the Google AI (Gemini) API.
      // Ensure this location matches the region where you have enabled
      // the Vertex AI API in your Google Cloud project.
      location: 'us-central1',
    }),
    // The firebase() plugin has been removed to resolve build issues.
    // Firebase Admin SDK is now initialized manually where needed.
  ],
});
