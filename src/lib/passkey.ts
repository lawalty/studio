
'use client';

import { getAuth, isSignInWithWebAuthn, linkWithPasskey } from "firebase/auth";
import { app } from "./firebase";

/**
 * Creates and links a new passkey to the currently signed-in user.
 * Throws an error if the operation fails.
 */
export async function createPasskey(): Promise<void> {
  if (!app) {
    throw new Error("Firebase app is not initialized.");
  }

  const auth = getAuth(app);
  if (!auth.currentUser) {
    throw new Error("No user is currently signed in to link a passkey to.");
  }

  // Check if the browser supports passkeys
  const isAvailable = await isSignInWithWebAuthn(auth);
  if (!isAvailable) {
    throw new Error("Passkeys are not supported on this browser or device.");
  }

  try {
    // This will trigger the browser's native UI for creating a passkey
    await linkWithPasskey(auth.currentUser);
  } catch (error: any) {
    console.error("Error linking passkey:", error);
    // Provide more user-friendly error messages
    if (error.code === 'auth/passkey-already-exists') {
      throw new Error("This passkey is already registered with another account.");
    }
    if (error.code === 'auth/missing-passkey') {
      throw new Error("No passkey was created. The operation was likely cancelled.");
    }
    throw new Error(`Failed to create passkey: ${error.message}`);
  }
}
