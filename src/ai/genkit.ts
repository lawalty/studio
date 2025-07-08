
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

// Initialize the Google AI plugin, explicitly passing the API key
// from the environment variable specified in the project's README.
const googleAiPlugin = googleAI({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

const plugins = [googleAiPlugin];

// This is the main exported object for Genkit.
// It is configured to use the Google AI plugin. By explicitly passing the
// apiKey, we ensure it uses the GOOGLE_AI_API_KEY from .env.local for local
// development. In a production environment (like App Hosting), it will
// fall back to using Application Default Credentials if the key is not set.
export const ai = genkit({
  plugins,
});
