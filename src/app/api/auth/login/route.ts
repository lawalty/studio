import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || adminPassword === 'your_secret_password_here') {
    console.error("ADMIN_PASSWORD environment variable is not set or is the default value.");
    return NextResponse.json({ error: 'Server configuration error. Please set a secure admin password.' }, { status: 500 });
  }

  if (password === adminPassword) {
    try {
      // The UID 'admin-uid' is a fixed identifier for the admin user.
      // This call was previously incorrect. It should use the global admin instance.
      const customToken = await admin.auth().createCustomToken('admin-uid');
      return NextResponse.json({ token: customToken });
    } catch (error) {
      console.error("Error creating custom token:", error);
      return NextResponse.json({ error: 'Failed to create session token.' }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: 'Invalid password.' }, { status: 401 });
  }
}
