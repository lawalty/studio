
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import { config } from 'dotenv';

// Load environment variables from .env.local, .env, etc.
config();

/**
 * @fileOverview Genkit Configuration
 *
 * This file configures the default Genkit AI instance for the application.
 *
 * It is configured to use the GOOGLE_AI_API_KEY from your project's
 * environment variables (.env.local for local development). This key is used for
 * general-purpose AI tasks like chat responses.
 *
 * Specialized tasks, like embeddings, may use a separate, dedicated key
 * (e.g., VERTEX_AI_API_KEY) by creating a temporary client within their flow.
 *
 * Make sure your .env.local file contains:
 * GOOGLE_AI_API_KEY=your_google_ai_api_key_here
 * VERTEX_AI_API_KEY=your_vertex_and_firestore_api_key_here
 */
export const ai = genkit({
  plugins: [
    googleAI({
      // The API key is provided via an environment variable for the default client.
      // Genkit and the googleAI plugin will automatically pick up
      // process.env.GOOGLE_AI_API_KEY if apiKey is unspecified.
      apiKey: process.env.GOOGLE_AI_API_KEY,
    }),
  ],
  logLevel: 'debug',
  // In-memory tracing for simplicity. For production, you might configure
  // a persistent trace store like Firebase.
});
