'use server';
/**
 * @fileOverview A flow to test server-side Firestore write access.
 * This flow is designed as a minimal test case to verify that the
 * server's authentication credentials (e.g., Application Default Credentials)
 * are correctly configured to communicate with Firebase services.
 *
 * - testFirestoreWrite - A function that performs a test write and delete.
 * - TestFirestoreWriteOutput - The return type for the function.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { db } from '@/lib/firebase-admin';

const TestFirestoreWriteOutputSchema = z.object({
  success: z.boolean().describe('Indicates if the Firestore write/delete was successful.'),
  error: z.string().optional().describe('An error message if the test failed.'),
});
export type TestFirestoreWriteOutput = z.infer<typeof TestFirestoreWriteOutputSchema>;

const testFirestoreWriteFlow = ai.defineFlow(
  {
    name: 'testFirestoreWriteFlow',
    inputSchema: z.void(),
    outputSchema: TestFirestoreWriteOutputSchema,
  },
  async () => {
    const testDocRef = db.collection('__diagnostic_tests').doc('firestore_write_test');
    try {
      // 1. Write a document
      await testDocRef.set({
        timestamp: new Date().toISOString(),
        status: 'test_running',
      });

      // 2. Read it back to confirm
      const docSnap = await testDocRef.get();
      if (!docSnap.exists) {
        throw new Error("Write appeared successful, but document could not be read back.");
      }

      // 3. Delete the document
      await testDocRef.delete();

      return { success: true };

    } catch (e: any) {
        console.error('[testFirestoreWriteFlow] Exception caught:', e);
        const rawError = e instanceof Error ? e.message : JSON.stringify(e);
        let detailedError: string;

        const isPermissionsError = e.code === 7 || (rawError && (rawError.includes('permission denied') || rawError.includes('IAM')));

        if (rawError.includes("Could not refresh access token")) {
            detailedError = `The test failed due to a local authentication error. The server running on your local machine could not authenticate with Google Cloud services.
            
**Action Required:** Please run 'gcloud auth application-default login' in your terminal and then restart the development server. See the 'Server-Side Authentication' section in README.md for full instructions.`;
        } else if (rawError.includes("PROJECT_BILLING_NOT_ENABLED")) {
            detailedError = `CRITICAL: The test failed because billing is not enabled for your Google Cloud project. Please go to your Google Cloud Console, select the correct project, and a billing account is linked.`;
        } else if (isPermissionsError) {
            detailedError = `CRITICAL: The server failed to write to Firestore due to a permissions error.

**Action Required:**
1.  Go to the Google Cloud Console -> **IAM & Admin**.
2.  Find the service account for your application (e.g., your-project-id@serverless-robot-prod.iam.gserviceaccount.com for App Hosting).
3.  Ensure this service account has the **"Firebase Admin"** or **"Cloud Datastore User"** role.`;
        } else {
            detailedError = `The Firestore write test failed for an unexpected reason. Full technical error: ${rawError}`;
        }
        
        return { success: false, error: detailedError };
    }
  }
);

export async function testFirestoreWrite(): Promise<TestFirestoreWriteOutput> {
  return testFirestoreWriteFlow();
}
