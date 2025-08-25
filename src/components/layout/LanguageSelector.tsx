'use client';

import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import { Languages } from 'lucide-react';

export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();

  const handleToggle = () => {
    setLanguage(language === 'English' ? 'Spanish' : 'English');
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleToggle}
        className={cn(
          'p-1.5 rounded-md border-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-background',
          language === 'Spanish' ? 'border-primary bg-primary/10' : 'border-transparent'
        )}
        aria-label="Toggle language"
      >
        <Languages className={cn("h-5 w-5 text-muted-foreground", language === 'Spanish' && 'text-primary')} />
      </button>
    </div>
  );
}
