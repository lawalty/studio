'use server';
import {genkit} from '@genkit-ai/core';
import {googleAI} from '@genkit-ai/googleai';
import {firebase as firebasePlugin} from '@genkit-ai/firebase';

export const ai = genkit({
  plugins: [googleAI(), firebasePlugin()],
  logSinks: ['firebase'],
  enableTracingAndMetrics: true,
});
