
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

/**
 * @fileOverview Genkit Configuration
 *
 * This file configures the default Genkit AI instance for the application.
 *
 * It is configured to use the Google AI plugin, which will automatically
 * use the `GOOGLE_AI_API_KEY` from your `.env.local` file.
 */

export const googleAi = googleAI();

export const ai = genkit({
  plugins: [
    googleAi, // This will automatically look for GOOGLE_AI_API_KEY in the environment.
  ],
  // In-memory tracing for simplicity. For production, you might configure
  // a persistent trace store like Firebase.
});
