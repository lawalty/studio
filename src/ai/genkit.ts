'use server';
import { ai, configureGenkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { firebase } from "@genkit-ai/firebase";

// Initialize Genkit and configure plugins.
// This is done once and can be used throughout the application.
configureGenkit({
  plugins: [
    // The Google AI plugin is used to generate content, embeddings, and more.
    googleAI({
      apiKey: process.env.GOOGLE_AI_API_KEY,
    }),
    // The Firebase plugin is used to integrate with Firebase services like Firestore.
    firebase(),
  ],
  // Log telemetry to the console and to Google Cloud.
  logSinks: ['firebase'],
  // Enable tracing and metrics for observability.
  enableTracingAndMetrics: true,
});

// Export the configured AI instance for use in other parts of the application.
export { ai };
