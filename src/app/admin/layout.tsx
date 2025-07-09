'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Home } from 'lucide-react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
            <Link href="/admin">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Admin Console
            </Link>
            </Button>
            <Button asChild variant="outline">
            <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                App Front End
            </Link>
            </Button>
        </div>
      </div>
      {children}
    </div>
  );
}
