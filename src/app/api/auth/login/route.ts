
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/firebase-admin';

// This is the new, simplified login route that uses environment variables directly.
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // 1. Get the admin password from the server's environment variables.
    // This is more reliable than trying to fetch from Firestore during login.
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error("[Login API] ADMIN_PASSWORD environment variable is not set on the server.");
      return NextResponse.json(
        { error: 'Server configuration error: Admin password not set.' },
        { status: 500 }
      );
    }

    // 2. Check if the provided password matches the one from the environment.
    if (password !== adminPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials. Please try again.' },
        { status: 401 }
      );
    }

    // 3. If the password is correct, create a session token for the admin user.
    // We use a static UID for the admin user. This could be any unique string.
    const adminUid = 'admin-user-uid'; 
    const customToken = await auth.createCustomToken(adminUid);

    return NextResponse.json({ token: customToken });

  } catch (error: any) {
    console.error('[Login API] An unexpected error occurred:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}
