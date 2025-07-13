'use server';
import { ai, configureGenkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { firebase } from "@genkit-ai/firebase";

// A flag to ensure configureGenkit is only called once.
let genkitConfigured = false;

if (!genkitConfigured) {
  configureGenkit({
    plugins: [
      googleAI(),
      firebase(),
    ],
    logSinks: ['firebase'],
    enableTracingAndMetrics: true,
  });
  genkitConfigured = true;
}

// Export the configured AI instance for use in other parts of the application.
export { ai };
