# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Environment Variables

This project requires environment variables to connect to services like Firebase and Google AI.

### 1. Create `.env.local`

Create a new file named `.env.local` in the root directory of this project. This file is for your local secrets and will not be checked into version control.

### 2. Add Google AI API Keys (Required for AI Features)

For the AI chat and knowledge base features to work, you must provide API Keys for Google AI services.

*   Get a key from **[Google AI Studio](https://makersuite.google.com/app/apikey)**.
*   **IMPORTANT**: For the Knowledge Base (embeddings) to work, you must create a key that has permissions for **both** the **Vertex AI API** and the **Cloud Firestore API**.
*   Add the following lines to your `.env.local` file, replacing the placeholders with your actual keys:

    ```
    # Used for general AI chat and text generation.
    GOOGLE_AI_API_KEY=your_google_ai_api_key_here

    # Used for creating and querying knowledge base embeddings (RAG).
    # This key MUST have permissions for both Vertex AI and Cloud Firestore APIs.
    VERTEX_AI_API_KEY=your_vertex_and_firestore_api_key_here
    ```

### 3. Add Firebase Config (Required for Database/Storage)

For features like saving settings, managing the knowledge base, or using Twilio integration, you need to connect the app to a Firebase project.

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
