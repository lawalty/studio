# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Environment Variables

This project requires environment variables to connect to services like Firebase and Google AI.

### 1. Create `.env.local`

Create a new file named `.env.local` in the root directory of this project. This file is for your local secrets and will not be checked into version control.

### 2. Add Google AI API Key (Required for ALL AI Features)

For any AI features to work (chat, knowledge base, etc.), you must provide a single, powerful Google AI API Key.

*   Get a key from **[Google AI Studio](https://makersuite.google.com/app/apikey)** or the Google Cloud Console.
*   **IMPORTANT**: For the application to function correctly, this single key **MUST** have permissions for all three of the following APIs in your Google Cloud project:
    1.  **Vertex AI API**
    2.  **Cloud Firestore API**
    3.  **Generative Language API**
*   Add the following line to your `.env.local` file, replacing the placeholder with your actual key:

    ```
    # This single key powers all AI features including chat and the knowledge base (RAG).
    # It MUST have permissions for Vertex AI, Cloud Firestore, and Generative Language APIs.
    GOOGLE_AI_API_KEY=your_multi_permission_google_ai_api_key_here
    ```

### 3. Add Firebase Config (Required for Database/Storage)

For features like saving settings and managing the knowledge base, you need to connect the app to a Firebase project.

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
