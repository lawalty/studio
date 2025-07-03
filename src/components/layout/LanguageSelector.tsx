'use client';

import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';

// Simplified SVG for the USA flag
const UsaFlagIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 24" {...props}>
    <path fill="#B22234" d="M0 0h32v24H0z"/>
    <path d="M0 4h32M0 8h32M0 12h32m0 4H0m0 4h32" stroke="#fff" strokeWidth="4"/>
    <path fill="#3C3B6E" d="M0 0h16v12H0z"/>
  </svg>
);

// Simplified SVG for the Mexico flag
const MexicoFlagIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 24" {...props}>
    <path fill="#006847" d="M0 0h10.667v24H0z"/>
    <path fill="#fff" d="M10.667 0h10.666v24H10.667z"/>
    <path fill="#CE1126" d="M21.333 0H32v24H21.333z"/>
  </svg>
);

export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setLanguage('English')}
        className={cn(
          'p-0.5 rounded-sm border-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-background',
          language === 'English' ? 'border-primary' : 'border-transparent'
        )}
        aria-label="Set language to English"
      >
        <UsaFlagIcon className="h-4 w-6 rounded-sm block" />
      </button>
      <button
        onClick={() => setLanguage('Spanish')}
        className={cn(
          'p-0.5 rounded-sm border-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-background',
          language === 'Spanish' ? 'border-primary' : 'border-transparent'
        )}
        aria-label="Set language to Spanish"
      >
        <MexicoFlagIcon className="h-4 w-6 rounded-sm block" />
      </button>
    </div>
  );
}
