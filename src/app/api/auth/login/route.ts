import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';

// This function now ONLY reads the password from the environment variables.
// This removes the dependency on Firestore, which was causing the login API to crash.
async function getAdminPassword(): Promise<string | null> {
  const envPassword = process.env.ADMIN_PASSWORD;
  if (envPassword && envPassword.trim() !== '') {
    return envPassword;
  }
  // Return null if no password is set in the environment.
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const adminPassword = await getAdminPassword();

    if (!adminPassword) {
      return NextResponse.json({ error: 'CRITICAL: The ADMIN_PASSWORD is not configured on the server in your .env.local file.' }, { status: 500 });
    }

    if (password !== adminPassword) {
      return NextResponse.json({ error: 'Invalid password.' }, { status: 401 });
    }

    const uid = 'admin-user';
    // This call will now succeed because the Admin SDK initialization will have completed
    // without the Firestore call interfering.
    const customToken = await auth.createCustomToken(uid);
    
    return NextResponse.json({ token: customToken });

  } catch (error: any) {
    console.error("[Login API] Error creating custom token:", error);
    
    let detailedError = 'An unexpected server error occurred during login.';
    const errorMessage = error.message || '';

    // Provide more specific feedback for common Firebase Admin SDK issues.
    if (errorMessage.includes('Failed to parse service account') || errorMessage.includes('Credential implementation provided') || errorMessage.includes('permission-denied') || errorMessage.includes('IAM')) {
        detailedError = 'Server configuration error: The Firebase Admin SDK could not authenticate with Google Cloud. Please ensure your `service-account-key.json` is correct and the service account has the "Service Account Token Creator" IAM role.';
    }

    return NextResponse.json({ error: detailedError }, { status: 500 });
  }
}
