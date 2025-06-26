
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

      // A more robust check for a valid embedding response.
      if (result && Array.isArray(result.embedding) && result.embedding.length > 0) {
        return {
          success: true,
          embeddingVectorLength: result.embedding.length,
        };
      } else {
        const fullResponse = JSON.stringify(result, null, 2);
        const errorMessage = `The embedding service returned an unexpected response. While it didn't crash, the response was not a valid embedding vector. The full response from the service was: ${fullResponse}`;
        return {
          success: false,
          error: errorMessage,
        };
      }
    } catch (e: any) {
      console.error('[testEmbeddingFlow] Exception caught:', e);
      return {
          success: false,
          error: `The test failed with an unexpected exception: ${e.message || 'Unknown error'}. Full details: ${JSON.stringify(e, Object.getOwnPropertyNames(e), 2)}`,
      };
    }
  }
);
