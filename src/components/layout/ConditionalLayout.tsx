
'use client';

import type { ReactNode } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { Toaster } from "@/components/ui/toaster";
// No longer importing useSearchParams

export default function ConditionalLayout({ children }: { children: ReactNode }) {
  // Logic for isEmbedded based on useSearchParams is removed.
  // It will now always render Header and Footer as if not embedded.
  const isEmbedded = false; 

  return (
    <>
      {!isEmbedded && <Header />}
      <main className="flex-grow container mx-auto px-4 py-8">
        {children}
      </main>
      {!isEmbedded && <Footer />}
      <Toaster />
    </>
  );
}

    