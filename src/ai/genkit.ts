
import { genkit, type GenkitPlugin } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { firebase as firebaseAuth } from '@genkit-ai/firebase';

const plugins: GenkitPlugin[] = [googleAI()];

// The firebase() plugin is required for authentication in the App Hosting
// production environment. It is not needed for local development.
if (process.env.NODE_ENV === 'production') {
  plugins.push(firebaseAuth());
}

// This is the main exported object for Genkit.
// It is configured to use the Google AI plugin, which automatically
// uses the GOOGLE_AI_API_KEY environment variable.
export const ai = genkit({
  plugins,
  // In Genkit 1.x, logLevel and tracing are configured differently,
  // and tracing is typically enabled by default.
});
