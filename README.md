# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Environment Variables

This project requires environment variables to connect to Google AI and Firebase services.

### 1. Create `.env.local`

Create a new file named `.env.local` in the root directory of this project. This file is for your local secrets and will not be checked into version control. You can copy the template from the `.env` file.

### 2. Add Google AI API Key (Required)

For the application's AI features to function correctly, you must provide a Google AI API key.

*   Go to **[Google AI Studio](https://aistudio.google.com/app/apikey)** to create and copy your API key.
*   Add the key to your `.env.local` file:

    ```
    GOOGLE_AI_API_KEY=your_api_key_here
    ```

*   **IMPORTANT**: Ensure the API key is associated with a Google Cloud project that has the **"Vertex AI API"** enabled.

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

### 4. Add Vertex AI Vector Search Config (Required for RAG)

For the Retrieval-Augmented Generation (RAG) knowledge base to function, you need to provide details about your Vertex AI Vector Search setup.

*   **Prerequisite:** You must first create a Vector Search Index and a public Index Endpoint in the Google Cloud Console under "Vertex AI" -> "Vector Search".
*   Add the following lines to your `.env.local` file:

    ```
    # The ID of your Google Cloud project (same as your Firebase project ID).
    GCLOUD_PROJECT=your_project_id

    # The region where you created your Vertex AI index (e.g., us-central1).
    LOCATION=your-gcp-region

    # The numeric ID of the Vector Search index itself.
    VERTEX_AI_INDEX_ID=your-index-id

    # The numeric ID of the public endpoint for your index.
    VERTEX_AI_INDEX_ENDPOINT_ID=your-index-endpoint-id
    ```

### 5. Restart the App

After creating or modifying the `.env.local` file, you **must restart the application** for the changes to take effect