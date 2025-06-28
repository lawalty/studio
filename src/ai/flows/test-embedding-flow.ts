
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
      let errorMessage = "The test failed with an unexpected exception. ";
      
      const errorDetails = e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e));

      if (errorDetails.includes('403 Forbidden') || errorDetails.includes('PERMISSION_DENIED')) {
          errorMessage = 'The test failed (403 Forbidden). This usually means the "Vertex AI API" is not enabled in your Google Cloud project or the service account is missing the "Vertex AI User" role. Please check your project configuration.';
      } else if (errorDetails.includes('API key not valid')) {
          errorMessage = 'The test failed due to an authentication error. The application uses service account credentials, not API keys. Please check your IAM & API settings in Google Cloud.';
      } else {
          errorMessage += `Details: ${errorDetails}`;
      }
      
      return {
          success: false,
          error: errorMessage,
      };
    }
  }
);
