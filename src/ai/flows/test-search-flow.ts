'use server';
/**
 * @fileOverview A Genkit flow for testing the vector search functionality from the client.
 * This flow provides detailed feedback on the search outcome, including diagnostic information.
 */
import { z } from 'zod';
import { searchKnowledgeBase } from '@/ai/retrieval/vector-search';
import type { SearchResult as ClientSearchResult } from '@/ai/retrieval/vector-search';
import { ai } from '@/ai/genkit';
import { preprocessText } from '../retrieval/preprocessing';
import { db } from '@/lib/firebase-admin';

export type SearchResult = ClientSearchResult;

const TestSearchInputSchema = z.object({
  query: z.string().min(1, "Query cannot be empty."),
  distanceThreshold: z.number().optional(),
});
export type TestSearchInput = z.infer<typeof TestSearchInputSchema>;

const TestSearchOutputSchema = z.object({
  success: z.boolean().describe('Indicates if the search found at least one document.'),
  message: z.string().describe('A human-readable message describing the outcome.'),
  results: z.array(z.custom<SearchResult>()).describe('The array of search results found.'),
  error: z.string().optional().describe('A technical error message if the operation failed catastrophically.'),
  diagnostics: z.object({
    preprocessedQuery: z.string(),
    embeddingGenerated: z.boolean(),
    embeddingSnippet: z.string().optional(),
    totalChunksFound: z.number().optional(),
  }).optional(),
});
export type TestSearchOutput = z.infer<typeof TestSearchOutputSchema>;

export async function testSearch(input: TestSearchInput): Promise<TestSearchOutput> {
  const preprocessedQuery = preprocessText(input.query);
  let embeddingGenerated = false;
  let embeddingSnippet: string | undefined = undefined;
  let totalChunksFound: number | undefined = undefined;

  try {
    // New Diagnostic Step: Count all chunks in the collection group.
    try {
        const chunksCollectionGroup = db.collectionGroup('kb_chunks');
        const snapshot = await chunksCollectionGroup.count().get();
        totalChunksFound = snapshot.data().count;
    } catch (countError: any) {
        console.error('[testSearchFlow] Failed to count chunks:', countError);
        // Don't fail the whole test, just report the error.
        return {
            success: false,
            message: "The diagnostic step to count total documents failed. This strongly suggests a problem with Firestore permissions or the collection group name.",
            results: [],
            error: `Chunk Counting Error: ${countError.message}`,
            diagnostics: { preprocessedQuery, embeddingGenerated, embeddingSnippet, totalChunksFound: 0 },
        };
    }

    // We generate an embedding here separately for diagnostics, even though searchKnowledgeBase does it too.
    // This helps isolate whether the embedding model itself is the point of failure.
    const embeddingResponse = await ai.embed({
        embedder: 'googleai/text-embedding-004',
        content: preprocessedQuery,
    });
    const embeddingVector = embeddingResponse?.[0]?.embedding;
    if (embeddingVector && embeddingVector.length > 0) {
        embeddingGenerated = true;
        embeddingSnippet = `[${embeddingVector.slice(0, 10).map(n => n.toFixed(3)).join(', ')}]`;
    }

    // If the count is zero, we can stop here and report it.
    if (totalChunksFound === 0) {
        return {
            success: false,
            message: "The search found 0 documents because the 'kb_chunks' collection group is empty or inaccessible. Please verify that the document was indexed successfully and that server permissions are correct.",
            results: [],
            diagnostics: { preprocessedQuery, embeddingGenerated, embeddingSnippet, totalChunksFound },
        };
    }


    const searchResults = await searchKnowledgeBase({ 
        query: input.query, // Pass original query, as searchKnowledgeBase does its own preprocessing
        distanceThreshold: 1.0, 
    });

    const distanceThreshold = input.distanceThreshold || 0.6;
    if (searchResults.length > 0) {
        const filteredResults = searchResults.filter(r => r.distance <= distanceThreshold);
        if (filteredResults.length > 0) {
            return {
                success: true,
                message: `Successfully found ${filteredResults.length} document(s) within the ${distanceThreshold.toFixed(2)} distance threshold. Total documents found before filtering: ${searchResults.length}.`,
                results: filteredResults,
                diagnostics: { preprocessedQuery, embeddingGenerated, embeddingSnippet, totalChunksFound },
            };
        } else {
            return {
                success: false,
                message: `Found ${searchResults.length} document(s), but none were within the specified distance threshold of ${distanceThreshold.toFixed(2)}. The closest match had a distance of ${searchResults[0].distance.toFixed(4)}. Try increasing the threshold.`,
                results: searchResults, 
                diagnostics: { preprocessedQuery, embeddingGenerated, embeddingSnippet, totalChunksFound },
            };
        }
    } else {
        return {
            success: false,
            message: "The search completed but found 0 documents from the 'kb_chunks' collection group. This means the query against the index returned nothing. Check if the document was indexed successfully and if the index is active.",
            results: [],
            diagnostics: { preprocessedQuery, embeddingGenerated, embeddingSnippet, totalChunksFound },
        };
    }
  } catch (e: any) {
      console.error('[testSearchFlow] Search test failed during execution:', e);
      return {
          success: false,
          message: "The search query failed to execute. This often points to a problem with the Firestore index itself or the service account permissions.",
          results: [],
          error: e.message,
          diagnostics: { preprocessedQuery, embeddingGenerated, embeddingSnippet, totalChunksFound },
      };
  }
}
