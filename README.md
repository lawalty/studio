# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Environment Variables

This project requires environment variables to connect to Google AI and Firebase services. There are two places to manage these: `.env.local` for local development and `apphosting.yaml` for the live (production) deployment.

### 1. Local Development Setup (`.env.local`)

For running the app on your local machine (`npm run dev`).

**Action:** Create a new file named `.env.local` in the root directory. Copy the contents of the `.env` file into it and fill in the values. The Project ID and Storage Bucket have been corrected in the `.env` template to prevent common errors.

**Variables to set in `.env.local`:**
*   `NEXT_PUBLIC_FIREBASE_API_KEY`="AIzaSyBOQWkvEwBkcweTvz2nFBpEzt7UjBawFPo"
*   `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`="ai-blair-v2.firebaseapp.com"
*   `NEXT_PUBLIC_FIREBASE_PROJECT_ID`="ai-blair-v2"
*   `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`="ai-blair-v2.appspot.com"
*   `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`="737697039654"
*   `NEXT_PUBLIC_FIREBASE_APP_ID`="1:737697039654:web:3c2d65e531a0e272be2de7"
*   `GEMINI_API_KEY` (Get from [Google AI Studio](https://aistudio.google.com/app/apikey))
*   `GCLOUD_PROJECT`="ai-blair-v2"
*   `LOCATION` (e.g., `us-central1`)
*   `VERTEX_AI_INDEX_ID`
*   `VERTEX_AI_INDEX_ENDPOINT_ID`
*   `VERTEX_AI_DEPLOYED_INDEX_ID`
*   `VERTEX_AI_PUBLIC_ENDPOINT_DOMAIN`
*   `ADMIN_PASSWORD` (A password you create for securing the admin login)

**Local Server Authentication:**
The server-side code needs to authenticate to Google Cloud.
*   **Prerequisite**: Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install).
*   **Action**: Run `gcloud auth application-default login` in your terminal and follow the prompts. You only need to do this once.

### 2. Production Deployment Setup (`apphosting.yaml` and Secret Manager)

For the live version of your app hosted on Firebase App Hosting.

**Action:** The configuration is managed in two places: `apphosting.yaml` for public variables and Google Secret Manager for private keys.

**Public Variables (`apphosting.yaml`):**
*   The `apphosting.yaml` file in your project root contains all the `NEXT_PUBLIC_*` variables. These are safe to commit to your repository.
*   When you deploy, Firebase uses this file to configure your live app. **The storage bucket has been corrected in this file.**

**Private Secrets (Secret Manager):**
*   Sensitive keys (`GEMINI_API_KEY`, `ADMIN_PASSWORD`, Vertex AI IDs, etc.) are referenced in `apphosting.yaml` but their actual values must be stored in Google Secret Manager for security.
*   **Action Required:**
    1.  Go to the [Google Cloud Secret Manager](https://console.cloud.google.com/security/secret-manager) for your project (`ai-blair-v2`).
    2.  For each secret variable listed in `apphosting.yaml` (like `GEMINI_API_KEY`), click **"Create Secret"**.
    3.  Enter the **Secret name** exactly as it appears in `apphosting.yaml` (e.g., `GEMINI_API_KEY`).
    4.  Enter the corresponding key/ID as the **Secret value**.
    5.  Leave the other settings as default and click **"Create secret"**.
    6.  **Crucially**, after creating the secret, you must grant your App Hosting service account access to it. Your service account will be named `PROJECT_NUMBER-compute@developer.gserviceaccount.com`. Grant it the **"Secret Manager Secret Accessor"** role.

### 3. Restart / Redeploy

*   **Local:** After changing `.env.local`, restart your development server (`npm run dev`).
*   **Production:** After changing `apphosting.yaml` or secrets, redeploy the app by clicking "Publish" in Firebase Studio.
