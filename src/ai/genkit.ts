'use server';

import { googleAI } from '@genkit-ai/googleai';
import { firebase } from '@genkit-ai/firebase';
import { genkit } from 'genkit';

export const ai = genkit({
  plugins: [
    googleAI(),
    // The firebase() plugin is used for production logging and authentication.
    process.env.NODE_ENV === 'production' ? firebase() : undefined,
  ].filter(p => p), // Filter out undefined plugins
});
