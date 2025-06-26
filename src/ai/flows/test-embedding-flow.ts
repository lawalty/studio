
'use server';
/**
 * @fileOverview A flow to test the core embedding functionality.
 * This flow is designed as a minimal test case to check if the
 * embedding service can be reached and returns a valid vector.
 *
 * - testEmbedding - A function that calls the embedding model with a hardcoded string.
 * - TestEmbeddingOutput - The return type for the function.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { textEmbedding004 } from '@genkit-ai/googleai';

const TestEmbeddingOutputSchema = z.object({
  success: z.boolean().describe('Indicates if the embedding was generated successfully.'),
  error: z.string().optional().describe('An error message if the test failed.'),
  embeddingVectorLength: z.number().optional().describe('The number of dimensions in the returned embedding vector.'),
});
export type TestEmbeddingOutput = z.infer<typeof TestEmbeddingOutputSchema>;

export async function testEmbedding(): Promise<TestEmbeddingOutput> {
  return testEmbeddingFlow();
}

const testEmbeddingFlow = ai.defineFlow(
  {
    name: 'testEmbeddingFlow',
    inputSchema: z.void(),
    outputSchema: TestEmbeddingOutputSchema,
  },
  async () => {
    try {
      const result = await ai.embed({
        embedder: textEmbedding004,
        content: 'This is a simple test sentence.',
        taskType: 'RETRIEVAL_DOCUMENT',
      });

      // The embedding vector was successfully generated.
      const embedding = result?.embedding;

      // Now, validate that the vector is not empty.
      if (embedding && embedding.length > 0) {
        return {
          success: true,
          embeddingVectorLength: embedding.length,
        };
      } else {
        // The service responded, but with an empty or invalid embedding.
        // This is a specific failure case we want to report clearly.
        const fullResponse = JSON.stringify(result, null, 2);
        const errorMessage = `The embedding service returned an empty or invalid vector. Full service response: ${fullResponse}`;
        console.error('[testEmbeddingFlow] Failed with empty vector:', result);
        return {
          success: false,
          error: errorMessage,
        };
      }
    } catch (e: any) {
      // An unexpected exception occurred during the API call.
      console.error('[testEmbeddingFlow] Exception caught:', e);
      const errorMessage = `The test failed with an unexpected exception. This often indicates a problem with API configuration or permissions in your Google Cloud project. Details: ${e.message || 'Unknown error'}`;
      return {
          success: false,
          error: errorMessage,
      };
    }
  }
);
