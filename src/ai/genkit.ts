'use server';

import { googleAI } from '@genkit-ai/googleai';
import { firebase } from '@genkit-ai/firebase';
import { genkit, type Plugin } from 'genkit';

const plugins: Plugin<any>[] = [googleAI()];

// In production, add the Firebase plugin for logging and auth.
if (process.env.NODE_ENV === 'production') {
  plugins.push(firebase());
}

export const ai = genkit({
  plugins: plugins,
});
