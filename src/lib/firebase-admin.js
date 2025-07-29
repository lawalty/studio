"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = exports.storage = exports.auth = exports.admin = exports.db = void 0;
/**
 * @fileOverview Centralized Firebase Admin SDK Initialization
 *
 * This file initializes the Firebase Admin SDK for the entire server-side
 * application. It ensures that the SDK is initialized only once.
 * It is configured to use Application Default Credentials for both local
 * development and deployed environments.
 */
var firebase_admin_1 = require("firebase-admin");
exports.admin = firebase_admin_1.default;
var auth_1 = require("firebase-admin/auth");
var firestore_1 = require("firebase-admin/firestore");
var storage_1 = require("firebase-admin/storage");
// A function to check if we are in a Google Cloud-managed environment.
var isGcp = function () { return !!(process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT); };
if (firebase_admin_1.default.apps.length === 0) {
    try {
        // By calling initializeApp() without arguments, the SDK automatically
        // uses Application Default Credentials. In local development, this
        // uses the credentials from 'gcloud auth application-default login'.
        // In a deployed App Hosting environment, it uses the app's service account.
        firebase_admin_1.default.initializeApp({
            projectId: process.env.GCLOUD_PROJECT || 'ai-blair-v4',
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'ai-blair-v4.appspot.com',
        });
    }
    catch (error) {
        // This enhanced error handling provides specific, actionable advice
        // if the Admin SDK fails to initialize, which is almost always a
        // credentialing problem in local development.
        if (!isGcp() && (error.message.includes('Could not find') || error.message.includes('ADC'))) {
            console.error("\n        ================================================================================\n        CRITICAL: FIREBASE ADMIN SDK INITIALIZATION FAILED\n        ================================================================================\n        This is a common issue in local development. The server cannot find your\n        Application Default Credentials.\n\n        To fix this, please run the following command in your terminal:\n\n            gcloud auth application-default login\n\n        After running the command and authenticating, you MUST restart your\n        development server for the changes to take effect.\n\n        See the README.md file for more information.\n        --------------------------------------------------------------------------------\n        Original Error: ".concat(error.stack, "\n        ================================================================================\n      "));
        }
        else {
            console.error('[firebase-admin] Firebase Admin SDK initialization error:', error.stack);
        }
        // Re-throw the error to prevent the app from starting in a broken state.
        throw new Error('Failed to initialize Firebase Admin SDK. See server logs for details.');
    }
}
var app = firebase_admin_1.default.app();
exports.app = app;
var db = (0, firestore_1.getFirestore)(app);
exports.db = db;
var auth = (0, auth_1.getAuth)(app);
exports.auth = auth;
var storage = (0, storage_1.getStorage)(app);
exports.storage = storage;
