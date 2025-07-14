
'use server';
import { type Plugin } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import firebasePlugin from '@genkit-ai/firebase';
import { genkit } from 'genkit';

const plugins: Plugin<any>[] = [
  googleAI(),
];

if (process.env.NODE_ENV === 'production') {
  plugins.push(firebasePlugin());
}

export const ai = genkit({
  plugins,
  logSinks: process.env.NODE_ENV === 'production' ? ['firebase'] : [],
  enableTracingAndMetrics: true,
});
