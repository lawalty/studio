'use server';
/**
 * @fileOverview A flow to redact PII from an SME transcript and then index it.
 *
 * - ingestSmeTranscript - Redacts and indexes a transcript.
 * - IngestSmeTranscriptInput - The input type for the function.
 */
import { getGenkitAi } from '@/ai/genkit';
import { z } from 'genkit';
import { indexDocument } from './index-document-flow';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
    admin.initializeApp();
}

export const IngestSmeTranscriptInputSchema = z.object({
  transcript: z.string().describe('The full text content of the SME conversation.'),
  sourceName: z.string().describe('A descriptive name for this transcript source, e.g., "SME Session on PLO with John Doe".'),
  level: z.string().describe('The priority level for this knowledge (e.g., High, Medium).'),
  topic: z.string().describe('The topic category for this transcript.'),
  description: z.string().optional().describe('An optional description for the source.'),
});
export type IngestSmeTranscriptInput = z.infer<typeof IngestSmeTranscriptInputSchema>;

const RedactionOutputSchema = z.object({
  redactedText: z.string().describe('The transcript with all PII removed or replaced with placeholders.'),
});

export async function ingestSmeTranscript(
  input: IngestSmeTranscriptInput
): Promise<{ success: boolean; error?: string }> {
  const ai = await getGenkitAi();

  const ingestSmeTranscriptFlow = ai.defineFlow(
    {
      name: 'ingestSmeTranscriptFlow',
      inputSchema: IngestSmeTranscriptInputSchema,
      outputSchema: z.object({ success: z.boolean(), error: z.string().optional() }),
    },
    async ({ transcript, sourceName, level, topic, description }) => {
      // Step 1: Redact PII from the transcript
      let redactedText = '';
      try {
        const redactionPrompt = ai.definePrompt({
            name: 'redactPiiFromTranscript',
            model: 'googleai/gemini-1.5-flash-latest',
            input: { schema: z.object({ text: z.string() }) },
            output: { schema: RedactionOutputSchema },
            prompt: `You are a data privacy expert. Your task is to redact all Personally Identifiable Information (PII) from the following text.
            PII includes, but is not limited to:
            - Names of people
            - Email addresses
            - Phone numbers
            - Physical addresses
            - Social Security Numbers or other government IDs
            - Any other data that could uniquely identify an individual.
            
            Replace all found PII with a generic placeholder like '[REDACTED]'. Do not alter the structure or non-PII content of the text.
            
            Original Text:
            {{{text}}}
            
            Your Redacted Output:`,
        });

        const { output } = await redactionPrompt({ text: transcript });
        if (!output?.redactedText) {
            throw new Error('Redaction process returned empty text.');
        }
        redactedText = output.redactedText;
      } catch (e: any) {
        const errorMessage = `Failed to redact transcript: ${e.message || 'Unknown error'}`;
        console.error(`[ingestSmeTranscriptFlow] ${errorMessage}`);
        return { success: false, error: errorMessage };
      }

      // Step 2: Index the redacted transcript
      try {
        const sourceId = `sme-${Date.now()}`;
        
        // Since this is just text, it won't have a download URL.
        // We will treat it like a pasted text snippet.
        const indexResult = await indexDocument({
          sourceId,
          sourceName,
          text: redactedText,
          level,
          topic,
          // No downloadURL as this is generated from a transcript
        });

        if (!indexResult.success) {
          throw new Error(indexResult.error || 'Indexing failed for an unknown reason.');
        }

        // We also need to save the source metadata, similar to how file uploads work
         const metadata = {
            id: sourceId,
            name: sourceName,
            type: 'text',
            size: `${(Buffer.byteLength(redactedText, 'utf8') / 1024).toFixed(2)} KB`,
            uploadedAt: new Date().toISOString(),
            storagePath: `transcripts/${sourceId}`, // A virtual path
            downloadURL: null,
            description: description || 'SME Transcript',
            extractionStatus: 'success', // Text is already extracted
            indexingStatus: 'indexed',
            topic: topic,
         };
         
         const config = {
            High: { firestorePath: "configurations/kb_high_meta_v1" },
            Medium: { firestorePath: "configurations/kb_medium_meta_v1" },
            Low: { firestorePath: "configurations/kb_low_meta_v1" },
            Archive: { firestorePath: "configurations/kb_archive_meta_v1" },
        }[level as 'High' | 'Medium' | 'Low' | 'Archive'];
        
        if (config) {
            const docRef = admin.firestore().doc(config.firestorePath);
            await admin.firestore().runTransaction(async (transaction) => {
                const doc = await transaction.get(docRef);
                const sources = doc.data()?.sources || [];
                sources.unshift(metadata);
                transaction.set(docRef, { sources });
            });
        }


        return { success: true };
      } catch (e: any) {
        const errorMessage = `Failed to index redacted transcript: ${e.message || 'Unknown error'}`;
        console.error(`[ingestSmeTranscriptFlow] ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
    }
  );

  return ingestSmeTranscriptFlow(input);
}
