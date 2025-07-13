'use server';
import { ai as coreAI, flow as coreFlow, configureGenkit, defineFlow, startFlow } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { firebase } from "@genkit-ai/firebase";

// A flag to ensure configureGenkit is only called once.
let genkitConfigured = false;

function ensureGenkitConfigured() {
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
}

// Ensure configuration is run when the module is loaded.
ensureGenkitConfigured();

/**
 * A wrapper around the core AI function to ensure Genkit is configured.
 */
export const ai = (...args: Parameters<typeof coreAI>) => {
  ensureGenkitConfigured();
  return coreAI(...args);
};

/**
 * A wrapper around the core flow function to ensure Genkit is configured.
 */
export { defineFlow, startFlow };
