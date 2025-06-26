
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
      const response = await ai.embed({
        embedder: 'googleai/embedding-001',
        content: 'This is a simple test sentence.',
        taskType: 'RETRIEVAL_DOCUMENT',
      });

      const embedding = response.embedding;

      if (embedding && Array.isArray(embedding) && embedding.length > 0) {
        return {
          success: true,
          embeddingVectorLength: embedding.length,
        };
      } else {
        // Return the raw response directly in the error message for debugging.
        const rawResponseString = JSON.stringify(response, null, 2);
        return {
          success: false,
          error: `The embedding service returned an empty or invalid vector. Raw response from service: ${rawResponseString}`,
        };
      }
    } catch (e: any) {
      // Return the raw exception directly in the error message for debugging.
      const rawExceptionString = JSON.stringify(e, Object.getOwnPropertyNames(e), 2);
      return {
        success: false,
        error: `An exception occurred during the embedding call. Raw exception: ${rawExceptionString}`,
      };
    }
  }
);
