'use server';

import { googleAI } from '@genkit-ai/googleai';
import { firebase } from '@genkit-ai/firebase';
import { genkit, Plugin } from 'genkit';

const firebasePlugin = firebase();

const plugins: Plugin<any>[] = [googleAI()];
if (process.env.NODE_ENV === 'production') {
  plugins.push(firebasePlugin);
}

export const ai = genkit({
  plugins: plugins,
});
