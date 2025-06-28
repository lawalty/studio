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
import { geminiProEmbedder } from '@genkit-ai/googleai';


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
        embedder: geminiProEmbedder,
        content: 'This is a simple test sentence.',
        taskType: 'RETRIEVAL_DOCUMENT',
      });

      const embeddingVector = result.embedding;
      const embeddingAsArray = embeddingVector ? Array.from(embeddingVector) : [];

      if (embeddingAsArray.length > 0) {
        // SUCCESS!
        return {
          success: true,
          embeddingVectorLength: embeddingAsArray.length,
        };
      } else {
        const fullResponse = JSON.stringify(result, null, 2);
        return { 
          success: false, 
          error: `The embedding service returned an empty or invalid embedding. This may indicate a problem with the API configuration, project billing, or content being blocked by safety filters. Full response: ${fullResponse}` 
        };
      }

    } catch (e: any) {
      console.error('[testEmbeddingFlow] Exception caught:', e);
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      
      return {
          success: false,
          error: `The test failed. This often points to a Google Cloud project configuration issue. Please check your IAM permissions and enabled APIs as described in the README file. Full technical error: ${errorMessage}`,
      };
    }
  }
);
