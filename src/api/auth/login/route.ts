
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || adminPassword.trim() === '' || adminPassword === 'your_super_secret_password') {
    console.error("ADMIN_PASSWORD environment variable is not set or is the default value.");
    return NextResponse.json({ error: 'Server configuration error. Please set a secure admin password in your .env.local file.' }, { status: 500 });
  }

  if (password === adminPassword) {
    try {
      // The UID 'admin-uid' is a fixed identifier for the admin user.
      const customToken = await admin.auth().createCustomToken('admin-uid');
      return NextResponse.json({ token: customToken });
    } catch (error: any) {
      console.error("Error creating custom token:", error);
      
      let detailedError = `This is a server configuration issue.`;

      // This is a more specific check for the most common cause of this error.
      if (error.code === 'auth/insufficient-permission' || (error.message && error.message.includes('iam.serviceAccounts.signBlob'))) {
        detailedError = `The server's credentials do not have permission to create login tokens. This is the root cause of the 'Failed to create session token' error.

**Action Required:**
1. Go to the Google Cloud Console -> IAM & Admin -> IAM.
2. Find the user account you logged in with via the 'gcloud auth application-default login' command (it should be your email address).
3. Click the pencil icon to edit its roles.
4. Click 'ADD ANOTHER ROLE' and search for 'Service Account Token Creator'.
5. Select that role, save the changes, and then **restart your application server**.

Full error from Google: ${error.message}`;
      } else {
        detailedError += ` Please check the server logs for more details. Full error: ${error.message}`;
      }

      return NextResponse.json({ error: detailedError }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: 'Invalid password.' }, { status: 401 });
  }
}
