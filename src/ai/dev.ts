import {start} from 'genkit';

// Note: This is a dev-only file, used for running the Genkit Inspector.
// In production, these flows are imported and used directly by the Next.js app.
import './flows/extract-text-from-document-url-flow';
import './flows/index-document-flow';
import './flows/generate-chat-response';
import './flows/persona-personality-tuning';
import './flows/send-sms-flow';
import './flows/generate-sms-response';
import './flows/test-knowledge-base-flow';
import './flows/test-embedding-flow';
import './flows/test-text-generation-flow';
import './flows/text-to-speech-flow';
import './tools/knowledge-base-tool';

start();
