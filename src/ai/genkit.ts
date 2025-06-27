
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

/**
 * @fileOverview Genkit Configuration
 *
 * This file configures the Genkit AI instance for the application.
 *
 * The @genkit-ai/firebase plugin has been removed to resolve a persistent
 * build/runtime error with Next.js. Tracing and flow state will be stored
 * in-memory by default.
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
  ],
  // Firebase-backed trace and flow state stores are disabled to resolve a build issue.
  // Traces will be available in-memory when running locally with 'genkit:watch'.
  logLevel: 'debug',
  // traceStore: 'firebase',
  // flowStateStore: 'firebase',
});
