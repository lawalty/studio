
'use client';

import Link from 'next/link';
import { Bot } from 'lucide-react';
import React from 'react';

export default function Header() {

  return (
    <header className="bg-card border-b border-border">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-primary hover:text-accent transition-colors">
          <Bot size={28} />
          <h1 className="text-2xl font-bold font-headline">AI Blair</h1>
        </Link>
      </div>
    </header>
  );
}
