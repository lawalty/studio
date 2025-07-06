
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { firebase as firebaseAuth } from '@genkit-ai/firebase';

// This is the main exported object for Genkit.
// It is configured to use the Google AI plugin, which automatically
// uses the GOOGLE_AI_API_KEY environment variable.
// The firebase() plugin is now re-enabled to handle server-side authentication
// in the Firebase App Hosting environment.
export const ai = genkit({
  plugins: [
    googleAI(),
    firebaseAuth(),
  ],
  // In Genkit 1.x, logLevel and tracing are configured differently,
  // and tracing is typically enabled by default.
});
