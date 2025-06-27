
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

/**
 * @fileOverview Genkit Configuration
 *
 * This file configures the Genkit AI instance for the application.
 *
 * This default 'ai' instance is configured to use Application Default Credentials (ADC).
 * This means it will automatically use the service account credentials provided by the
 * Firebase App Hosting environment.
 *
 * For operations that require a user-provided API key (like embeddings), flows will
 * dynamically create a temporary, key-configured Genkit instance.
 *
 * See individual flows and the Admin > API Keys page for more details.
 */
export const ai = genkit({
  plugins: [
    googleAI(), // No API key here; relies on ADC.
  ],
  logLevel: 'debug',
  // Trace and flow state stores are not configured to use Firebase to avoid build issues.
  // Traces will be available in-memory when running locally with 'genkit:watch'.
});
