
'use client';

import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { translateText } from '@/ai/flows/translate-text-flow';
import { useToast } from "@/hooks/use-toast";

type Language = 'English' | 'Spanish';

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  translate: (text: string) => Promise<string>;
  translations: Record<string, string>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>('English');
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const translate = useCallback(async (text: string): Promise<string> => {
    if (language === 'English' || !text) {
      return text;
    }
    
    // Create a language-specific key for the cache to handle language switching correctly.
    const translationKey = `${language}:${text}`;
    if (translations[translationKey]) {
      return translations[translationKey];
    }

    try {
      const result = await translateText({ text, targetLanguage: language });
      const translated = result.translatedText;
      if (!translated || translated.trim() === '') {
        throw new Error("AI returned an empty translation.");
      }
      setTranslations(prev => ({ ...prev, [translationKey]: translated }));
      return translated;
    } catch (error: any) {
      console.error('Translation failed for:', text, error);
      toast({
          variant: "destructive",
          title: "Translation Error",
          description: `Could not translate text to ${language}. Using default. Error: ${error.message || 'Unknown'}`
      });
      return text; // Return original text on error
    }
  }, [language, translations, toast]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, translate, translations }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
