
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import { config } from 'dotenv';

// Load environment variables from .env.local, .env, etc. for client-side keys.
config();

/**
 * @fileOverview Genkit Configuration
 *
 * This file configures the default Genkit AI instance for the application.
 *
 * It is configured to use Application Default Credentials (ADC).
 * When deployed to a Google Cloud environment (like Firebase App Hosting),
 * Genkit automatically uses the permissions of the attached service account.
 *
 * You DO NOT need to set a GOOGLE_AI_API_KEY in your environment for this to work.
 *
 * Ensure the runtime service account has the necessary IAM roles:
 * 1. Vertex AI User (for generative model access)
 * 2. Service Account Token Creator (for authentication)
 * 3. Cloud Datastore User (for Firestore access)
 */
export const ai = genkit({
  plugins: [
    googleAI({
      // The googleAI plugin will automatically use Application Default Credentials
      // if no API key is provided. This is the recommended setup for secure
      // server-side environments.
    }),
  ],
  // In-memory tracing for simplicity. For production, you might configure
  // a persistent trace store like Firebase.
});
