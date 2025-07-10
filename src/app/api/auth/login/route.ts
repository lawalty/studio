import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword || adminPassword === 'your_secret_password_here' || adminPassword.trim() === '') {
      console.error("ADMIN_PASSWORD environment variable is not set or is the default value.");
      return NextResponse.json({ error: 'CRITICAL: Admin password is not configured on the server.' }, { status: 500 });
    }

    if (password !== adminPassword) {
      return NextResponse.json({ error: 'Invalid password.' }, { status: 401 });
    }

    // The UID 'admin-user' is a fixed identifier for your single admin user.
    const uid = 'admin-user';
    const customToken = await auth.createCustomToken(uid);
    
    return NextResponse.json({ token: customToken });

  } catch (error: any) {
    console.error("[Login API] Error creating custom token:", error);
    
    let detailedError = 'Failed to create session token due to a server-side error.';
    if (error.code === 'auth/insufficient-permission' || (error.message && error.message.includes('iam.serviceAccountTokenCreator'))) {
        detailedError = 'Server configuration error: The service account or local user is missing the "Service Account Token Creator" IAM role in Google Cloud.';
    } else if (error.message && error.message.includes('Could not refresh access token')) {
        detailedError = "Local authentication error. Please run 'gcloud auth application-default login' and restart the server.";
    }

    return NextResponse.json({ error: detailedError }, { status: 500 });
  }
}
