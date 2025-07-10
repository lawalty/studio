import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '@/lib/firebase-admin';

const FIRESTORE_CONFIG_PATH = "configurations/site_display_assets";
const DEFAULT_PASSWORD_FALLBACK = "thisiscool"; // Fallback only if Firestore fails

async function getAdminPassword(): Promise<string> {
  try {
    const docRef = db.doc(FIRESTORE_CONFIG_PATH);
    const docSnap = await docRef.get();
    if (docSnap.exists()) {
      const data = docSnap.data();
      // Use the password from Firestore if it exists and is not empty
      if (data?.adminPassword && data.adminPassword.trim() !== "") {
        return data.adminPassword;
      }
    }
    // If no password in Firestore, use the environment variable as a fallback/initial value.
    // This allows the first login to work before it's saved in the UI.
    const envPassword = process.env.ADMIN_PASSWORD;
    if (envPassword && envPassword.trim() !== '') {
        return envPassword;
    }
    return DEFAULT_PASSWORD_FALLBACK;
  } catch (error) {
    console.error("Error fetching admin password from Firestore, using fallback. Error:", error);
    // Fallback to environment variable or default if Firestore is inaccessible
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

    if (error.code === 'auth/insufficient-permission' || (error.message && (error.message.includes('iam.serviceAccountTokenCreator') || error.message.includes('Permission denied')))) {
        detailedError = 'Server configuration error: The service account or local user is missing the "Service Account Token Creator" IAM role in Google Cloud. Please grant this role to the principal running the application.';
    } else if (error.message && error.message.includes('Could not refresh access token')) {
        detailedError = "Local authentication error. The server could not authenticate with Google Cloud. Please run 'gcloud auth application-default login' in your terminal, ensure you are logged in with the correct account that has 'Service Account Token Creator' permissions, and then restart the development server.";
    } else if (error.code === 'auth/invalid-credential' || (error.message && error.message.includes("Credential implementation provided to initializeApp() via the \"credential\" property failed")) || (error.message && error.message.includes("Error: Failed to parse service account key"))) {
        detailedError = "Firebase Admin SDK initialization failed. This can be caused by an invalid or missing service account configuration for local development. Please ensure your SERVICE_ACCOUNT_KEY in .env.local is set correctly."
    }

    return NextResponse.json({ error: detailedError }, { status: 500 });
  }
}