
'use server';
/**
 * @fileOverview A flow to index a document by chunking its text and writing
 * the chunks to Firestore, where a vector search extension will handle embedding.
 *
 * - indexDocument - Chunks text and writes it to Firestore.
 * - IndexDocumentInput - The input type for the function.
 * - IndexDocumentOutput - The return type for the function.
 */
import { z } from 'zod';
import { db, admin } from '@/lib/firebase-admin';

const IndexDocumentInputSchema = z.object({
  sourceId: z.string().describe('The unique ID of the source document.'),
  sourceName: z.string().describe('The original filename of the source document.'),
  text: z.string().describe('The full text content of the document to be indexed.'),
  level: z.string().describe('The priority level of the knowledge base (e.g., High, Medium).'),
  topic: z.string().describe('The topic category for the document.'),
  downloadURL: z.string().url().optional().describe('The public downloadURL for the source file.'),
});
export type IndexDocumentInput = z.infer<typeof IndexDocumentInputSchema>;

const IndexDocumentOutputSchema = z.object({
  chunksWritten: z.number().describe('The number of text chunks written to Firestore.'),
  sourceId: z.string().describe('The unique ID of the source document that was processed.'),
  success: z.boolean().describe('Indicates whether the operation completed without errors.'),
  error: z.string().optional().describe('An error message if the operation failed.'),
});
export type IndexDocumentOutput = z.infer<typeof IndexDocumentOutputSchema>;

// A simple text splitter function.
function simpleSplitter(text: string, { chunkSize, chunkOverlap }: { chunkSize: number; chunkOverlap: number }): string[] {
    if (chunkOverlap >= chunkSize) {
      throw new Error("chunkOverlap must be smaller than chunkSize.");
    }
    if (text.length <= chunkSize) {
      return [text].filter(c => c.trim() !== '');
    }

    const chunks: string[] = [];
    let index = 0;
    while (index < text.length) {
      const end = index + chunkSize;
      const chunk = text.slice(index, end);
      if (chunk.trim() !== '') {
        chunks.push(chunk);
      }
      index += chunkSize - chunkOverlap;
    }
    return chunks;
  }

export async function indexDocument({ 
    sourceId, 
    sourceName, 
    text, 
    level, 
    topic, 
    downloadURL 
}: IndexDocumentInput): Promise<IndexDocumentOutput> {
      // This reference points to the document that holds the metadata for the file.
      const sourceDocRef = db.collection(`kb_${level.toLowerCase()}_meta_v1`).doc(sourceId);

      try {
        const cleanText = text.trim();
        if (!cleanText) {
            const errorMessage = "No readable text content found. The source has been automatically removed.";
            console.warn(`[indexDocument] ${errorMessage} Document: '${sourceName}'.`);

            // Delete from Storage first
            if (downloadURL) {
                const filePath = `knowledge_base_files/${level}/${sourceId}-${sourceName}`;
                try {
                    await admin.storage().bucket().file(filePath).delete();
                } catch (e: any) {
                    if (e.code !== 'storage/object-not-found') {
                        console.error(`[indexDocument] Failed to auto-delete storage file '${filePath}':`, e);
                    }
                }
            }
            // Then delete the metadata from Firestore
            await sourceDocRef.delete();

            return { chunksWritten: 0, sourceId, success: false, error: errorMessage };
        }
        
        const chunks = simpleSplitter(cleanText, {
          chunkSize: 1000, 
          chunkOverlap: 100,
        });

        if (chunks.length > 0) {
          const batch = db.batch();
          const chunksCollection = db.collection('kb_chunks');
          chunks.forEach((chunkText, index) => {
            const chunkDocRef = chunksCollection.doc(); 
            batch.set(chunkDocRef, {
              sourceId,
              sourceName,
              level,
              topic,
              text: chunkText,
              chunkNumber: index + 1,
              createdAt: new Date().toISOString(),
              downloadURL: downloadURL || null,
            });
          });
          await batch.commit();
        }
        
        // Final status update. Use set with merge to ensure the document exists.
        await sourceDocRef.set({
          indexingStatus: 'success',
          chunksWritten: chunks.length,
          indexedAt: new Date().toISOString(),
          indexingError: '',
          sourceName,
          level,
          topic,
          downloadURL: downloadURL || null,
          createdAt: new Date().toISOString(),
        }, { merge: true });
        
        return {
          chunksWritten: chunks.length,
          sourceId,
          success: true,
        };

      } catch (e: any) {
        console.error(`[indexDocument] Raw error for source '${sourceName}':`, e);
        const rawError = e instanceof Error ? e.message : (e.message || JSON.stringify(e));
        let detailedError: string;

        const isPermissionsError = e.code === 7 || (rawError && (rawError.includes('permission denied') || rawError.includes('IAM')));
        const isServerError = rawError && (rawError.includes("Could not refresh access token") || rawError.includes("500") || rawError.includes("UNAVAILABLE"));

        if (rawError.includes("PROJECT_BILLING_NOT_ENABLED")) {
            detailedError = `CRITICAL: Indexing failed because billing is not enabled for your Google Cloud project. Please go to your Google Cloud Console, select the correct project, and ensure that a billing account is linked.`;
        } else if (isPermissionsError) {
            detailedError = `CRITICAL: The application's server failed to write to Firestore due to a permissions error. This is NOT an issue with the Vector Search extension.

**Action Required:**
1.  Go to the Google Cloud Console -> **IAM & Admin**.
2.  Find the service account for your application. If you are using Firebase App Hosting, it will look like **your-project-id@serverless-robot-prod.iam.gserviceaccount.com**.
3.  Ensure this service account has the **"Firebase Admin"** or **"Cloud Datastore User"** role. This role is required for the server to write to the database.
4.  If the roles are correct, check the application's runtime logs in your hosting provider for more details.`;
        } else if (isServerError) {
          detailedError = `Indexing failed due to a temporary server-side issue (e.g., a timeout or token refresh failure). This is often transient. Please wait a moment and try the operation again. Full technical error: ${rawError}`;
        } else {
            detailedError = `Indexing failed for an unexpected reason. Full technical error: ${rawError}`;
        }

        // This update MUST NOT crash the function if it also fails.
        try {
          await sourceDocRef.set({ indexingStatus: 'failed', indexingError: detailedError, sourceName, level, topic, downloadURL: downloadURL || null, createdAt: new Date().toISOString() }, { merge: true });
        } catch (updateError) {
          console.error(`[indexDocument] CRITICAL: Failed to write failure status back to Firestore for source '${sourceName}'. The UI may not reflect the error.`, updateError);
        }

        return {
          chunksWritten: 0,
          sourceId,
          success: false,
          error: detailedError,
        };
      }
}
