
'use server';
import { configureGenkit, type Plugin } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { firebase } from '@genkit-ai/firebase';
import genkit from 'genkit';

const plugins: Plugin<any>[] = [
  googleAI(),
];

if (process.env.NODE_ENV === 'production') {
  plugins.push(firebase());
}

configureGenkit({
  plugins,
  enableTracingAndMetrics: true,
  // The firebase() plugin automatically configures logging for production.
  // Explicitly defining logSinks is not required when using it.
  logSinks: [], 
});

export { genkit as ai };
