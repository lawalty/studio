# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Environment Variables

This project may require environment variables to connect to certain Firebase services.

### 1. Create `.env.local`

Create a new file named `.env.local` in the root directory of this project. This file is for your local secrets and will not be checked into version control.

### 2. Google Cloud Authentication (IMPORTANT)

This application is designed to run on Google Cloud infrastructure (like Firebase App Hosting) and uses **Application Default Credentials (ADC)**. This means it automatically and securely authenticates using the permissions of its runtime service account.

**You do NOT need to set a `GOOGLE_AI_API_KEY` in your `.env.local` file.**

For the application to function correctly, the service account running the app (e.g., the App Hosting service account) **MUST** have the following IAM roles enabled in your Google Cloud project:
1.  **Service Account Token Creator**: Allows the service account to create access tokens for other APIs.
2.  **Cloud Datastore User**: Allows reading from and writing to Firestore.
3.  **Vertex AI User**: Allows access to Vertex AI models.
4.  **(Optional) Service Usage Consumer**: May be needed to access certain services.

Additionally, you must ensure the following APIs are **enabled** in your Google Cloud project:
1.  **IAM Service Account Credentials API** (`iamcredentials.googleapis.com`)
2.  **Vertex AI API** (`aiplatform.googleapis.com`)
3.  **Cloud Firestore API** (`firestore.googleapis.com`)

### 3. Add Firebase Config (Required for Database/Storage on Client)

For client-side features to connect to your Firebase project, you need to provide the public Firebase configuration.

*   Add the following lines to your `.env.local` file, replacing the placeholders with your actual Firebase project credentials:

    ```
    NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
    NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
    ```

*   **Where to find these values:** You can find your Firebase project's configuration in the Firebase Console:
    *   Go to your Firebase project.
    *   Click the gear icon next to "Project Overview" and select "Project settings".
    *   In the "General" tab, scroll down to the "Your apps" section.
    *   Select your web app.
    *   You will find the configuration values (`apiKey`, `authDomain`, etc.) there.

### 4. Restart the App

After creating or modifying the `.env.local` file, you **must restart the application** for the changes to take effect.
