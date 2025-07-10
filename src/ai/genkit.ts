/**
 * @fileOverview Centralized Genkit AI Initialization
 *
 * This file configures and initializes the Genkit AI plugin for the entire
 * application. It is set up to automatically use Application Default Credentials
 * (ADC), which is the standard and secure way to authenticate in a Google Cloud
 * environment.
 */
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

// Initialize the Google AI plugin. By not passing an explicit apiKey,
// the plugin will automatically use the Application Default Credentials.
// In local development, this uses the credentials from 'gcloud auth application-default login'.
// In a deployed environment (App Hosting), it automatically uses the app's service account.
const plugins = [googleAI()];

// This is the main exported object for Genkit.
export const ai = genkit({
  plugins,
});