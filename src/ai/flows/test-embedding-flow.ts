
'use server';
/**
 * @fileOverview A flow to test the core embedding functionality.
 * This flow is designed as a minimal test case to check if the
 * embedding service can be reached and returns a valid vector.
 *
 * - testEmbedding - A function that calls the embedding model with a hardcoded string.
 * - TestEmbeddingOutput - The return type for the function.
 */
import { z } from 'zod';
import { ai } from '@/ai/genkit'; // Ensures Genkit is configured

const TestEmbeddingOutputSchema = z.object({
  success: z.boolean().describe('Indicates if the embedding was generated successfully.'),
  error: z.string().optional().describe('An error message if the test failed.'),
  embeddingVectorLength: z.number().optional().describe('The number of dimensions in the returned embedding vector.'),
});
export type TestEmbeddingOutput = z.infer<typeof TestEmbeddingOutputSchema>;

const testEmbeddingFlow = async (): Promise<TestEmbeddingOutput> => {
    try {
      const embedding = await ai.embed({
        embedder: 'googleai/text-embedding-004',
        content: 'This is a simple test sentence.',
      });
      
      if (embedding && Array.isArray(embedding) && embedding.length > 0) {
        const vectorLength = embedding.length;
        if (vectorLength > 0) {
            return {
              success: true,
              embeddingVectorLength: vectorLength,
            };
        }
      } 
      
      return { 
        success: false, 
        error: `The embedding service returned an empty or invalid embedding structure.` 
      };

    } catch (e: any) {
        console.error('[testEmbeddingFlow] Exception caught:', e);
        const rawError = e instanceof Error ? e.message : JSON.stringify(e);
        let detailedError: string;

        if (rawError.includes("API key not valid")) {
            detailedError = "The provided Google AI API Key is invalid. Please verify it in your .env.local file or hosting provider's secret manager.";
        } else if (rawError.includes("API key is missing")) {
            detailedError = "The GEMINI_API_KEY environment variable is not set. Please add it to your .env.local file or hosting provider's secret manager.";
        } else if (rawError.includes("permission denied") || rawError.includes('IAM')) {
            detailedError = `A permissions issue occurred. Please check that the 'Vertex AI API' is enabled in your Google Cloud project and that your account has the correct IAM permissions.`;
        } else if (rawError.includes("PROJECT_BILLING_NOT_ENABLED")) {
            detailedError = `CRITICAL: The embedding feature failed because billing is not enabled for your Google Cloud project. Please link a billing account in the Google Cloud Console.`;
        } else {
            detailedError = `The embedding test failed. This is most often caused by a missing/invalid GEMINI_API_KEY or a Google Cloud project configuration issue (e.g., Vertex AI API or billing not enabled). Full error: ${rawError}`;
        }
        
        return { success: false, error: detailedError };
    }
  };

export async function testEmbedding(): Promise<TestEmbeddingOutput> {
  return testEmbeddingFlow();
}
