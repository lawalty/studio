
'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // If on the login page, don't render the shared admin layout
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const pageTitle = (() => {
    switch (pathname) {
      case '/admin':
        return 'Admin Dashboard';
      case '/admin/knowledge-base':
        return 'Knowledge Base';
      case '/admin/api-keys':
        return 'API Keys';
      case '/admin/persona':
        return 'Persona & Avatar';
      case '/admin/site-settings':
        return 'Site Settings';
      default:
        return 'Admin Panel';
    }
  })();

  if (!isClient) {
    return (
      <div className="space-y-6">
        <Card className="shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-10 w-44 hidden md:flex" />
              <Skeleton className="h-10 w-32" />
            </div>
          </CardHeader>
        </Card>
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-2xl font-headline">{pageTitle}</CardTitle>
          <div className="flex items-center gap-2">
            {pathname !== '/admin' && (
              <Button variant="outline" asChild>
                <Link href="/admin">
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Back to Dashboard
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> Go to App
              </Link>
            </Button>
          </div>
        </CardHeader>
      </Card>
      {children}
    </div>
  );
}
