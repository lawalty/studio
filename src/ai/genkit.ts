
'use server';
import { configureGenkit, type Plugin } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { firebase } from '@genkit-ai/firebase';

const plugins: Plugin<any>[] = [
  googleAI(),
];

if (process.env.NODE_ENV === 'production') {
  plugins.push(firebase());
}

export const ai = configureGenkit({
  plugins,
  logSinks: process.env.NODE_ENV === 'production' ? ['firebase'] : [],
  enableTracingAndMetrics: true,
});
