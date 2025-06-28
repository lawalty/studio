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
import { VertexAI } from '@google-cloud/vertexai';

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
      const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
      if (!projectId) {
        throw new Error('Google Cloud Project ID not found in environment variables. This is required for server-side authentication with Vertex AI.');
      }
      
      const vertex_ai = new VertexAI({ project: projectId, location: 'us-central1' });
      const model = vertex_ai.getGenerativeModel({
          model: 'text-embedding-004', // The Vertex AI model name for embedding
      });

      const result = await model.embedContent({
        requests: [{
          content: { parts: [{ text: 'This is a simple test sentence.' }] },
          taskType: 'RETRIEVAL_DOCUMENT',
        }]
      });
      
      const embeddingVector = result[0]?.embedding?.values;

      if (embeddingVector && embeddingVector.length > 0) {
        return {
          success: true,
          embeddingVectorLength: embeddingVector.length,
        };
      } else {
        const fullResponse = JSON.stringify(result, null, 2);
        return { 
          success: false, 
          error: `The embedding service returned an empty or invalid embedding. Full response: ${fullResponse}` 
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
