
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// This is the single, globally configured `genkit` instance.
// All other files will import and use this `ai` object.
//
// IMPORTANT: To resolve a framework-level issue with asynchronous API key loading,
// the AI SDK is now configured to ONLY use the GOOGLE_AI_API_KEY from your
// environment variables (e.g., in the .env.local file).
//
// The API key field in the Admin Console is no longer used by the backend.
// You must set the environment variable for the AI features to work.
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GOOGLE_AI_API_KEY,
    }),
  ],
});
