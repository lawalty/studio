import { config } from 'dotenv';
config();

import './flows/extract-text-from-document-url-flow';
import './flows/generate-chat-response';
import './flows/generate-sms-response';
import './flows/index-document-flow';
import './flows/persona-personality-tuning';
import './flows/send-sms-flow';
import './flows/test-embedding-flow';
import './flows/test-knowledge-base-flow';
import './flows/test-text-generation-flow';
import './flows/text-to-speech-flow';
