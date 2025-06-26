
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

/**
 * @fileOverview Genkit Configuration
 *
 * This file configures the Genkit AI instances for the application.
 *
 * Authentication is handled automatically via Application Default Credentials (ADC).
 * The application's service account has been granted the "Vertex AI User" role
 * in the Google Cloud IAM settings, so no API keys are required in this configuration.
 *
 * For more details on service account permissions, see the IAM page in the Google Cloud Console.
 */


// This is the primary Genkit instance for all GENERATIVE tasks (chat, summarization, etc.)
// The googleAI() plugin will automatically use the service account credentials
// when running in a Google Cloud environment (like Firebase App Hosting).
export const ai = genkit({
  plugins: [
    googleAI()
  ],
  model: 'googleai/gemini-1.5-flash-latest',
});


// This is a secondary Genkit instance configured specifically for EMBEDDING tasks.
// It also uses the same automatic service account authentication.
export const embedderAi = genkit({
    plugins: [
      googleAI()
    ],
});
