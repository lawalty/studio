
'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function ConditionalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith('/admin') && pathname !== '/admin/login';

  if (isAdminRoute) {
    return (
      <>
        <Header />
        <main className="flex-grow">
          {children}
        </main>
        <Footer />
      </>
    );
  }

  // For splash, chat, and login pages, provide a simple main wrapper.
  // These pages manage their own internal layout (e.g., centering, containers).
  return (
    <main className="flex-grow">
      {children}
    </main>
  );
}
