

'use server';
import { configureGenkit, type Plugin } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { firebase as firebasePlugin } from '@genkit-ai/firebase';
import genkit from 'genkit';

const plugins: Plugin<any>[] = [
  googleAI(),
];

if (process.env.NODE_ENV === 'production') {
  plugins.push(firebasePlugin());
}

configureGenkit({
  plugins,
  logSinks: process.env.NODE_ENV === 'production' ? ['firebase'] : [],
  enableTracingAndMetrics: true,
});

export { genkit as ai };

