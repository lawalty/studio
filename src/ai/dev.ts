
import { config } from 'dotenv';
config();

import '@/ai/flows/summarize-knowledge-base.ts';
import '@/ai/flows/persona-personality-tuning.ts';
import '@/ai/flows/generate-initial-greeting.ts';
import '@/ai/flows/generate-chat-response.ts';
import '@/ai/flows/extract-text-from-pdf-url-flow.ts'; // Added new flow

