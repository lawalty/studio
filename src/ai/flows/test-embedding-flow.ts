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
        embedder: 'googleai/text-embedding-004',
        content: 'This is a simple test sentence.',
        taskType: 'RETRIEVAL_DOCUMENT',
      });
      
      const embedding = response[0]?.embedding;

      if (embedding && embedding.length > 0) {
        return {
          success: true,
          embeddingVectorLength: embedding.length,
        };
      } else {
        return { 
          success: false, 
          error: `The embedding service returned an empty or invalid embedding.` 
        };
      }

    } catch (e: any) {
      console.error('[testEmbeddingFlow] Exception caught:', e);
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      
      return {
          success: false,
          error: `The test failed. This often points to an issue with your GOOGLE_AI_API_KEY or project configuration. Full technical error: ${errorMessage}`,
      };
    }
  }
);
