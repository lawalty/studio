
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
import { z } from 'zod';

const TestEmbeddingOutputSchema = z.object({
  success: z.boolean().describe('Indicates if the embedding was generated successfully.'),
  error: z.string().optional().describe('An error message if the test failed.'),
  embeddingVectorLength: z.number().optional().describe('The number of dimensions in the returned embedding vector.'),
});
export type TestEmbeddingOutput = z.infer<typeof TestEmbeddingOutputSchema>;

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
        const rawError = e instanceof Error ? e.message : JSON.stringify(e);
        let detailedError: string;

        if (e.name === 'TypeError' && rawError.includes('Headers.append')) {
            detailedError = `INTERNAL ERROR: The application's code is failing to correctly process the API key. This is a framework-level issue, not a problem with your API key or Google Cloud project configuration. Please report this issue.`;
        } else if (rawError.includes("PROJECT_BILLING_NOT_ENABLED")) {
            detailedError = `CRITICAL: The embedding feature failed because billing is not enabled for your Google Cloud project. Please go to your Google Cloud Console, select the correct project, and ensure that a billing account is linked.`;
        } else if (rawError.includes("Could not refresh access token")) {
            detailedError = `CRITICAL: The embedding test failed with a Google Cloud internal error, likely due to a project configuration issue. Please check the following: 1) Propagation Time: If you just enabled billing or APIs, it can take 5-10 minutes to activate. Please try again. 2) API Key: Ensure the Google AI API Key is correct. 3) API Status: Double-check that the 'Vertex AI API' is enabled in the Google Cloud Console.`;
        } else if (rawError.includes('permission denied') || rawError.includes('IAM')) {
            detailedError = `The embedding test failed due to a permissions issue. Please check that the App Hosting service account has the required IAM roles (e.g., Vertex AI User) and that the necessary Google Cloud APIs are enabled.`;
        } else {
            detailedError = `The embedding test failed. This is most often caused by a missing or invalid Google AI API Key. Please go to the Admin Console -> API Keys & Services page to verify your key is correct and saved. Also ensure the 'Vertex AI API' is enabled in your Google Cloud project.`;
        }
        
        return { success: false, error: detailedError };
    }
  }
);

export async function testEmbedding(): Promise<TestEmbeddingOutput> {
  return testEmbeddingFlow();
}
