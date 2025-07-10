import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '@/lib/firebase-admin';

const FIRESTORE_CONFIG_PATH = "configurations/site_display_assets";
const DEFAULT_PASSWORD_FALLBACK = "thisiscool";

async function getAdminPassword(): Promise<string> {
  try {
    const docRef = db.doc(FIRESTORE_CONFIG_PATH);
    const docSnap = await docRef.get();
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data?.adminPassword && data.adminPassword.trim() !== "") {
        return data.adminPassword;
      }
    }
    const envPassword = process.env.ADMIN_PASSWORD;
    if (envPassword && envPassword.trim() !== '') {
        return envPassword;
    }
    return DEFAULT_PASSWORD_FALLBACK;
  } catch (error) {
    console.error("Error fetching admin password from Firestore, using fallback. Error:", error);
    return process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD_FALLBACK;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const adminPassword = await getAdminPassword();

    if (!adminPassword) {
      return NextResponse.json({ error: 'CRITICAL: Admin password is not configured on the server.' }, { status: 500 });
    }

    if (password !== adminPassword) {
      return NextResponse.json({ error: 'Invalid password.' }, { status: 401 });
    }

    const uid = 'admin-user';
    const customToken = await auth.createCustomToken(uid);
    
    return NextResponse.json({ token: customToken });

  } catch (error: any) {
    console.error("[Login API] Error creating custom token:", error);
    
    let detailedError = 'Failed to create session token due to a server-side error.';
    const errorMessage = error.message || '';

    if (errorMessage.includes('Failed to parse service account key') || errorMessage.includes('Credential implementation provided') || errorMessage.includes('GOOGLE_APPLICATION_CREDENTIALS')) {
        detailedError = 'Firebase Admin SDK initialization failed. This is the most common cause of this error. Please check the following: 1. Your `.env.local` file MUST contain `GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json`. 2. The `service-account-key.json` file MUST be in the root directory of your project. 3. You MUST restart your development server after making any changes to these files.';
    } else if (errorMessage.includes('insufficient-permission') || errorMessage.includes('iam.serviceAccountTokenCreator')) {
        detailedError = 'Server configuration error: The service account is missing the "Service Account Token Creator" IAM role in Google Cloud.';
    }

    return NextResponse.json({ error: detailedError }, { status: 500 });
  }
}
