
'use client';

import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { translateText } from '@/ai/flows/translate-text-flow';

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

  const translate = useCallback(async (text: string): Promise<string> => {
    if (language === 'English' || !text) {
      return text;
    }
    if (translations[text]) {
      return translations[text];
    }
    try {
      const result = await translateText({ text, targetLanguage: language });
      const translated = result.translatedText;
      setTranslations(prev => ({ ...prev, [text]: translated }));
      return translated;
    } catch (error) {
      console.error('Translation failed for:', text, error);
      return text; // Return original text on error
    }
  }, [language, translations]);

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
