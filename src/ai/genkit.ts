
import { genkit, type Plugin } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

const plugins: Plugin<[]>[] = [googleAI()];

// This is the main exported object for Genkit.
// It is configured to use the Google AI plugin, which automatically
// uses the GOOGLE_AI_API_KEY environment variable for local development
// and Application Default Credentials in production.
export const ai = genkit({
  plugins,
  // In Genkit 1.x, logLevel and tracing are configured differently,
  // and tracing is typically enabled by default.
});
