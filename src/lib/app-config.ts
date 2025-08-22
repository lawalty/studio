
'use server';
/**
 * @fileoverview Centralized application configuration management.
 * This file provides a single, reliable function to fetch configuration
 * settings from Firestore, ensuring consistency across the application.
 */

import { db } from '@/lib/firebase-admin';

const FIRESTORE_APP_CONFIG_PATH = "configurations/app_config";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";

const DEFAULTS = {
    distanceThreshold: 0.8,
    formality: 50,
    conciseness: 50,
    tone: 50,
    formatting: 50,
    conversationalModel: 'gemini-1.5-pro-latest',
};

const MODEL_DISPLAY_NAMES: Record<string, string> = {
    'gemini-1.5-flash-latest': 'Gemini 1.5 Flash',
    'gemini-1.5-pro-latest': 'Gemini 1.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
};

export interface AppConfig {
  distanceThreshold: number;
  formality: number;
  conciseness: number;
  tone: number;
  formatting: number;
  conversationalModel: string;
  modelDisplayName: string;
}

/**
 * Fetches the application configuration from Firestore, merging settings
 * from both app_config and site_display_assets.
 *
 * @returns {Promise<AppConfig>} A promise that resolves to the merged app configuration object.
 */
export const getAppConfig = async (): Promise<AppConfig> => {
    try {
        const appConfigRef = db.doc(FIRESTORE_APP_CONFIG_PATH);
        const siteAssetsRef = db.doc(FIRESTORE_SITE_ASSETS_PATH);

        const [appConfigSnap, siteAssetsSnap] = await Promise.all([
            appConfigRef.get(),
            siteAssetsRef.get()
        ]);

        const appConfigData = appConfigSnap.exists ? appConfigSnap.data() : {};
        const siteAssetsData = siteAssetsSnap.exists ? siteAssetsSnap.data() : {};

        const conversationalModel = typeof appConfigData?.conversationalModel === 'string'
                ? appConfigData.conversationalModel
                : DEFAULTS.conversationalModel;
        
        const config = {
            distanceThreshold: typeof appConfigData?.distanceThreshold === 'number' 
                ? appConfigData.distanceThreshold 
                : DEFAULTS.distanceThreshold,
            formality: typeof siteAssetsData?.formality === 'number' 
                ? siteAssetsData.formality 
                : DEFAULTS.formality,
            conciseness: typeof siteAssetsData?.conciseness === 'number' 
                ? siteAssetsData.conciseness 
                : DEFAULTS.conciseness,
            tone: typeof siteAssetsData?.tone === 'number' 
                ? siteAssetsData.tone 
                : DEFAULTS.tone,
            formatting: typeof siteAssetsData?.formatting === 'number' 
                ? siteAssetsData.formatting 
                : DEFAULTS.formatting,
            conversationalModel: conversationalModel,
            modelDisplayName: MODEL_DISPLAY_NAMES[conversationalModel] || conversationalModel,
        };
        
        return config;

    } catch (error) {
        console.error(`[getAppConfig] CRITICAL: Failed to fetch config from Firestore. Falling back to all defaults.`, error);
        const model = DEFAULTS.conversationalModel;
        return {
            ...DEFAULTS,
            modelDisplayName: MODEL_DISPLAY_NAMES[model] || model,
        };
    }
};
