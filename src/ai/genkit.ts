
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import firebase from '@genkit-ai/firebase';
import { config } from 'dotenv';

// Load environment variables from .env.local, .env, etc.
config();

/**
 * @fileOverview Genkit Configuration
 *
 * This file configures the default Genkit AI instance for the application.
 *
 * It is configured to use a single, powerful GOOGLE_AI_API_KEY from your
 * project's environment variables (.env.local for local development).
 *
 * CRITICAL: This single API key MUST have permissions for all three of the
 * following APIs in your Google Cloud project for the application to function:
 * 1. Vertex AI API
 * 2. Cloud Firestore API
 * 3. Generative Language API
 */
export const ai = genkit({
  plugins: [
    firebase(),
    googleAI({
      // Genkit and the googleAI plugin will automatically pick up
      // process.env.GOOGLE_AI_API_KEY if apiKey is unspecified.
      // This key is used for all AI and database operations within flows.
    }),
  ],
  // In-memory tracing for simplicity. For production, you might configure
  // a persistent trace store like Firebase.
});
