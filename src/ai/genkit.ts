
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

/**
 * @fileOverview Genkit Configuration
 *
 * This file configures the default Genkit AI instance for the application.
 *
 * It is configured to use Application Default Credentials (ADC) by explicitly
 * targeting the Vertex AI platform. This is the most robust and secure method
 * for server-side Google Cloud environments like Firebase App Hosting.
 *
 * The `projectId` is automatically determined from the Google Cloud runtime
 * environment, so no manual configuration is needed.
 *
 * Ensure the runtime service account has the necessary IAM roles:
 * 1. Vertex AI User (for generative model access)
 * 2. Service Account Token Creator (for authentication)
 * 3. Cloud Datastore User (for Firestore access)
 */

// Force Genkit to use Vertex AI, which robustly supports service account authentication (ADC).
// This avoids issues where the default Google AI endpoint might incorrectly demand an API key.
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;

export const ai = genkit({
  plugins: [
    googleAI({
      projectId: projectId, // Force Vertex AI context by providing a project ID.
      location: 'us-central1', // A common default location for Vertex AI.
    }),
  ],
  // In-memory tracing for simplicity. For production, you might configure
  // a persistent trace store like Firebase.
});
