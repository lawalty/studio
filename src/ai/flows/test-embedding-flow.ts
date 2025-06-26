
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
      const { embedding } = await ai.embed({
        embedder: textEmbedding004,
        content: 'This is a simple test sentence.',
        taskType: 'RETRIEVAL_DOCUMENT',
      });

      // Use a more lenient check that works for both standard and TypedArrays.
      if (embedding?.length > 0) {
        return {
          success: true,
          embeddingVectorLength: embedding.length,
        };
      } else {
        // This is the specific error for a successful call with an empty response.
        return {
          success: false,
          error: `The embedding service returned a successful but empty response. This can happen if the Google Cloud project has not been fully provisioned for Vertex AI, or if there's a billing issue. Please double-check your project's billing status and ensure the Vertex AI API is enabled and has had time to provision.`,
        };
      }
    } catch (e: any) {
      // This provides a cleaner error directly in the UI toast for any other exception.
      console.error('[testEmbeddingFlow] Exception caught:', e);
      return {
          success: false,
          error: `The test failed with an unexpected exception: ${e.message || 'Unknown error'}. Full details: ${JSON.stringify(e, Object.getOwnPropertyNames(e), 2)}`,
      };
    }
  }
);
