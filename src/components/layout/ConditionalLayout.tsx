
'use client';

import type { ReactNode } from 'react';
// Header and Footer are no longer imported or used here
// Toaster is also removed as it's now in RootLayout

export default function ConditionalLayout({ children }: { children: ReactNode }) {
  // The distinction for admin routes is no longer needed here for Header/Footer,
  // as they are removed globally from this layout component.
  // Admin pages will use their own layout defined in src/app/admin/layout.tsx,
  // and front-end pages will simply not have a header or footer.
  // All pages will be wrapped in a 'main' tag for consistent structure & styling.

  return (
    <main className="flex-grow container mx-auto px-4 py-8">
      {children}
    </main>
  );
}
