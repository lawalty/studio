
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
// import { firebase } from '@genkit-ai/firebase';

// This is the main exported object for Genkit.
// It is configured to use the Google AI plugin, which automatically
// uses the GOOGLE_AI_API_KEY environment variable.
export const ai = genkit({
  plugins: [
    googleAI(),
    // firebase(), // Temporarily disabled due to a persistent runtime error.
  ],
  // In Genkit 1.x, logLevel and tracing are configured differently,
  // and tracing is typically enabled by default.
});
