
'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function ConditionalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isChatOrSplash = pathname.startsWith('/chat') || pathname === '/';

  if (isChatOrSplash) {
    return <main className="flex-grow flex flex-col">{children}</main>;
  }

  // Admin pages get the full layout with header and footer.
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8">
        {children}
      </main>
      <Footer />
    </div>
  );
}
