
'use client';

import Link from 'next/link';
import { Bot } from 'lucide-react';
import React, { useEffect } from 'react';
// No longer importing useRouter or usePathname

export default function Header() {
  // Removed complex useEffect logic related to embedded mode.
  // The 'splashScreenActive' event can still be useful if other components listen to it.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('splashScreenActive'));
  }, []);


  return (
    <header className="bg-card border-b border-border">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-primary hover:text-accent transition-colors">
          <Bot size={28} />
          <h1 className="text-2xl font-bold font-headline">AI Chat</h1>
        </Link>
        {/* Removed the conditional "Home / Restart" button */}
      </div>
    </header>
  );
}
