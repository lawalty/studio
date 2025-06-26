
import { config } from 'dotenv';
config();

import '@/ai/flows/persona-personality-tuning.ts';
import '@/ai/flows/generate-chat-response.ts';
import '@/ai/flows/extract-text-from-document-url-flow.ts';
import '@/ai/flows/index-document-flow.ts';
import '@/ai/flows/generate-sms-response.ts';
import '@/ai/flows/send-sms-flow.ts';
import '@/ai/flows/test-knowledge-base-flow.ts';
import '@/ai/flows/test-embedding-flow.ts';
