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
        if (docSnap.exists) { // <-- CORRECTED: Changed from exists() to exists
            const data = docSnap.data();
            const threshold = typeof data?.distanceThreshold === 'number'
                ? data.distanceThreshold
                : DEFAULT_DISTANCE_THRESHOLD;
            
            // Success log: Log the threshold being used.
            console.log(`[getAppConfig] Successfully loaded config. Using distanceThreshold: ${threshold}`);

            return {
                distanceThreshold: threshold,
            };
        } else {
            // Explicit warning if the document is not found.
            console.warn(`[getAppConfig] Firestore document not found at '${FIRESTORE_CONFIG_PATH}'. Using default distanceThreshold: ${DEFAULT_DISTANCE_THRESHOLD}`);
            return { distanceThreshold: DEFAULT_DISTANCE_THRESHOLD };
        }
    } catch (error) {
        // Enhanced error logging.
        console.error(`[getAppConfig] CRITICAL: Failed to fetch config from Firestore at '${FIRESTORE_CONFIG_PATH}'. Falling back to default.`, error);
        return { distanceThreshold: DEFAULT_DISTANCE_THRESHOLD };
    }
};
