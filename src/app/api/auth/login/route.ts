import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { app } from '@/lib/firebase-admin';

// Initialize auth using the imported admin app
const auth = getAuth(app);

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
    
    // Provide a more specific error message for the most common issue.
    if (error.code === 'auth/insufficient-permission' || (error.message && error.message.includes('iam.serviceAccountTokenCreator'))) {
        return NextResponse.json({ error: 'Server configuration error: The service account or local user is missing the "Service Account Token Creator" IAM role in Google Cloud.' }, { status: 500 });
    }

    return NextResponse.json({ error: 'Failed to create session token due to a server-side error.' }, { status: 500 });
  }
}
