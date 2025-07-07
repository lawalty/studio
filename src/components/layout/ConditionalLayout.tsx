
'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function ConditionalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isImmersive = pathname.startsWith('/chat') || pathname === '/' || pathname === '/updates-coming';

  if (isImmersive) {
    // For immersive pages, we provide a simple flex container that will grow to fill the parent body.
    return (
      <main className="flex-grow flex flex-col">
        {children}
      </main>
    );
  }

  // For all other pages (like /admin/*), provide the standard layout with header and footer.
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
