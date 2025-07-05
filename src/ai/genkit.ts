
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
// The Firebase Genkit plugin is causing a persistent module resolution error in this environment.
// We will temporarily disable it to unblock testing of the core indexing pipeline.
// We will re-enable it later to provide server-side auth for other flows.
// import firebase = require('@genkit-ai/firebase');

// This is the main exported object for Genkit.
// It is configured to use the Google AI plugin, which automatically
// uses the GOOGLE_AI_API_KEY environment variable.
export const ai = genkit({
  plugins: [
    googleAI(),
    // firebase(), // Temporarily disabled to debug indexing.
  ],
  // In Genkit 1.x, logLevel and tracing are configured differently,
  // and tracing is typically enabled by default.
});
