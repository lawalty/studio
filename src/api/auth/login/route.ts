
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || adminPassword.trim() === '' || adminPassword === 'your_super_secret_password_here') {
    console.error("ADMIN_PASSWORD environment variable is not set or is the default value.");
    return NextResponse.json({ error: 'Server configuration error. Please set a secure admin password in your .env.local file.' }, { status: 500 });
  }

  if (password === adminPassword) {
    try {
      const customToken = await admin.auth().createCustomToken('admin-uid');
      return NextResponse.json({ token: customToken });
    } catch (error: any) {
      console.error("Error creating custom token:", error);
      
      const errorMessage = error.message || '';
      let detailedError = 'Failed to create session token. Please check the server logs for more details.';

      if (errorMessage.includes('iam.serviceAccounts.signBlob') || errorMessage.includes('Service Account Token Creator')) {
          detailedError = `The server has an authentication permission issue. The account used for local development is missing a required Google Cloud role.

**ACTION REQUIRED:**
1.  Go to the Google Cloud Console -> **IAM & Admin**.
2.  Find the user account you logged in with when you ran \`gcloud auth application-default login\`.
3.  Click the pencil icon to edit its roles.
4.  Add the **"Service Account Token Creator"** role. This is required for the server to create login sessions.
5.  Save the changes and **restart your app's development server**.`;

      } else if (error.code === 'auth/invalid-credential' || errorMessage.includes('Could not refresh access token')) {
          detailedError = `The server failed to authenticate with Google. This is often due to missing or expired local credentials.
          
**ACTION REQUIRED:**
1.  Run \`gcloud auth application-default login\` in your terminal.
2.  Follow the prompts to log in with your Google account.
3.  **Important:** Restart the Next.js development server after the command succeeds.

See README.md for more details on server authentication.`;
      }

      return NextResponse.json({ error: detailedError }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: 'Invalid password.' }, { status: 401 });
  }
}
