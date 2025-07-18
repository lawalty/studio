import { googleAI } from '@genkit-ai/googleai';
import { genkit } from '@genkit-ai/core';
import type { Plugin } from '@genkit-ai/core';

const plugins: Plugin<any>[] = [googleAI()];

// The firebase plugin was causing persistent build errors and is not critical
// for the core functionality of the application. It has been removed to unblock
// development and deployment.
// if (process.env.NODE_ENV === 'production') {
//   // This is where the firebase plugin would be added for production logging.
// }

export const ai = genkit({
  plugins: plugins,
});
