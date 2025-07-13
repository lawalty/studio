'use server';
import {genkit} from '@genkit-ai/core';
import {googleAI} from '@genkit-ai/googleai';
import {firebase} from 'genkit-plugin-firebase';

export const ai = genkit({
  plugins: [googleAI(), firebase()],
  logSinks: ['firebase'],
  enableTracingAndMetrics: true,
});