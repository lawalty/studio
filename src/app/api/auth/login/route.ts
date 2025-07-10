
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/firebase-admin';

// This is the new, simplified login route that uses environment variables directly.
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error("[Login API] ADMIN_PASSWORD environment variable is not set on the server.");
      return NextResponse.json(
        { error: 'Server configuration error: The ADMIN_PASSWORD is not set on the server. Please check your environment variables.' },
        { status: 500 }
      );
    }

    if (password !== adminPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials. Please try again.' },
        { status: 401 }
      );
    }

    const adminUid = 'admin-user-uid'; 
    const customToken = await auth.createCustomToken(adminUid);

    return NextResponse.json({ token: customToken });

  } catch (error: any) {
    // This is the new, detailed error handling.
    console.error('[Login API] A critical error occurred during custom token creation:', error);
    
    let detailedError = 'An unexpected internal server error occurred.';
    if (error.code === 'auth/internal-error' || error.message?.includes('googleapis')) {
        detailedError = `Firebase authentication failed on the server. This often means the server can't connect to Google's services. Please ensure your project's billing is enabled and there are no network restrictions. Raw error: ${error.message}`;
    } else if (error.message) {
        detailedError = `An internal error occurred: ${error.message}`;
    }

    return NextResponse.json(
      { error: detailedError },
      { status: 500 }
    );
  }
}
