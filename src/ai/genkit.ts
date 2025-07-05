
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { firebase } from '@genkit-ai/firebase';

// This is the main exported object for Genkit.
// It is configured to use the Google AI plugin, which automatically
// uses the GOOGLE_AI_API_KEY environment variable.
export const ai = genkit({
  plugins: [
    googleAI(),
    firebase(), // The Firebase plugin is essential for proper server-side auth.
  ],
  // In Genkit 1.x, logLevel and tracing are configured differently,
  // and tracing is typically enabled by default.
});
