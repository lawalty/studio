
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

      const embedding = result?.embedding;

      // This is the corrected validation.
      // The vector can be a Float32Array, which is not a standard Array.
      // We check if it's an array-like object with a length property.
      if (embedding && typeof embedding.length === 'number' && embedding.length > 0) {
        return {
          success: true,
          embeddingVectorLength: embedding.length,
        };
      }
      
      const fullResponse = JSON.stringify(result, null, 2);
      const errorMessage = `The embedding service returned a successful response, but the embedding vector was empty or in an unexpected format. Full service response: ${fullResponse}`;
      console.error('[testEmbeddingFlow] Failed with invalid vector format:', result);
      return {
        success: false,
        error: errorMessage,
      };

    } catch (e: any) {
      console.error('[testEmbeddingFlow] Exception caught:', e);
      // The JSON stringify here is important to see the full error object.
      const fullError = JSON.stringify(e, Object.getOwnPropertyNames(e), 2);
      const errorMessage = `The test failed with an unexpected exception. This often indicates a problem with API configuration or permissions. Details: ${e.message || 'Unknown error'}. Full error object: ${fullError}`;
      return {
          success: false,
          error: errorMessage,
      };
    }
  }
);
