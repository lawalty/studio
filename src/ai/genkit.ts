
'use server';

import { type Plugin } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import * as firebasePlugin from '@genkit-ai/firebase';
import { genkit } from 'genkit';

const plugins: Plugin<any>[] = [
  googleAI(),
];

if (process.env.NODE_ENV === 'production') {
  // Correctly call the firebase function to initialize the plugin
  plugins.push(firebasePlugin.firebase());
}

export const ai = genkit({
  plugins,
  enableTracingAndMetrics: true,
});
