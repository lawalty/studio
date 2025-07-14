
'use server';
import { type Plugin } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { firebase } from '@genkit-ai/firebase';
import { genkit } from 'genkit';

const plugins: Plugin<any>[] = [
  googleAI(),
];

if (process.env.NODE_ENV === 'production') {
  // Correctly call the firebase function to initialize the plugin
  plugins.push(firebase());
}

export const ai = genkit({
  plugins,
  enableTracingAndMetrics: true,
});
