'use server';
/**
 * @fileoverview Centralized application configuration management.
 * This file provides a single, reliable function to fetch configuration
 * settings from Firestore, ensuring consistency across the application.
 */

import { db } from '@/lib/firebase-admin';

const FIRESTORE_CONFIG_PATH = "configurations/app_config";
const DEFAULT_DISTANCE_THRESHOLD = 0.8;

interface AppConfig {
  distanceThreshold: number;
}

/**
 * Fetches the application configuration from Firestore.
 * Currently retrieves the RAG distance threshold.
 *
 * @returns {Promise<AppConfig>} A promise that resolves to the app configuration object.
 *          It defaults to a distanceThreshold of 0.8 if the document or field is not found.
 */
export const getAppConfig = async (): Promise<AppConfig> => {
    try {
        const docRef = db.doc(FIRESTORE_CONFIG_PATH);
        const docSnap = await docRef.get();
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Ensure the fetched value is a number, otherwise use the default.
            const threshold = typeof data?.distanceThreshold === 'number'
                ? data.distanceThreshold
                : DEFAULT_DISTANCE_THRESHOLD;
            return {
                distanceThreshold: threshold,
            };
        }
        // Return default if no config document is found.
        return { distanceThreshold: DEFAULT_DISTANCE_THRESHOLD };
    } catch (error) {
        console.error("[getAppConfig] Error fetching config from Firestore, using default. Error:", error);
        // Fallback to default in case of any read error.
        return { distanceThreshold: DEFAULT_DISTANCE_THRESHOLD };
    }
};
