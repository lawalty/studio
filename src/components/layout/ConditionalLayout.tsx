
'use client';

import type { ReactNode } from 'react';
// import { useSearchParams } from 'next/navigation'; // Removed for rollback
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { Toaster } from "@/components/ui/toaster";

export default function ConditionalLayout({ children }: { children: ReactNode }) {
  // const searchParams = useSearchParams(); // Removed for rollback
  // const isEmbedded = searchParams.get('embedded') === 'true'; // Removed for rollback
  const isEmbedded = false; // Reverted to always false for non-embedded experience

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
    
