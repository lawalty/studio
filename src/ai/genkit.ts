
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import { config } from 'dotenv';

// Load environment variables from .env.local, .env, etc.
config();

/**
 * @fileOverview Genkit Configuration
 *
 * This file configures the Genkit AI instance for the application.
 *
 * It is now configured to use the GOOGLE_AI_API_KEY from your project's
 * environment variables (.env.local for local development). This is the
 * standard and most robust way to provide credentials to a server process,
 * resolving previous authentication issues.
 *
 * Make sure your .env.local file contains the following line:
 * GOOGLE_AI_API_KEY=your_google_ai_api_key_here
 */
export const ai = genkit({
  plugins: [
    googleAI({
      // The API key is now provided via an environment variable.
      // Genkit and the googleAI plugin will automatically pick up
      // process.env.GOOGLE_AI_API_KEY.
    }),
  ],
  logLevel: 'debug',
  // In-memory tracing for simplicity. For production, you might configure
  // a persistent trace store like Firebase.
});
