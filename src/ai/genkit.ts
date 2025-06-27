
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {config} from 'dotenv';

config(); // Load environment variables from .env files

/**
 * @fileOverview Genkit Configuration
 *
 * This file configures the Genkit AI instance for the application.
 *
 * It is configured to use an API Key provided via the GOOGLE_AI_API_KEY
 * environment variable. You must set this in a .env.local file in the
 * root of your project for AI functionality to work.
 *
 * See the README.md and the Admin > API Keys page for more details.
 */
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GOOGLE_AI_API_KEY,
    }),
  ],
  logLevel: 'debug',
  // Trace and flow state stores are not configured to use Firebase to avoid build issues.
  // Traces will be available in-memory when running locally with 'genkit:watch'.
});
