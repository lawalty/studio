# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Environment Variables

This project requires a connection to a Firebase project to function correctly. The configuration is managed through environment variables.

1.  **Create the file:** Create a new file named `.env.local` in the root directory of this project.

2.  **Add your Firebase config:** Add the following lines to your `.env.local` file, replacing the placeholder values with your actual Firebase project credentials.

    ```
    NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
    NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
    ```

3.  **Where to find these values:** You can find your Firebase project's configuration in the Firebase Console:
    *   Go to your Firebase project.
    *   Click the gear icon next to "Project Overview" and select "Project settings".
    *   In the "General" tab, scroll down to the "Your apps" section.
    *   Select your web app.
    *   You will find the configuration values (`apiKey`, `authDomain`, etc.) there.

4. **Restart the App:** After saving the `.env.local` file, you must restart the application for the changes to take effect.
