
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
      
      const errorCode = error.code ? ` (Code: ${error.code})` : '';
      const errorMessage = error.message ? ` Message: ${error.message}` : ' An unknown error occurred.';

      // This detailed error will now be shown in the toast on the login page.
      const detailedError = `This is a server configuration issue. Please see the details below and check your server logs for the full error object.\n---\nDetails from Server${errorCode}${errorMessage}`;

      return NextResponse.json({ error: detailedError }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: 'Invalid password.' }, { status: 401 });
  }
}
