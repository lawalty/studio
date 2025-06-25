
'use client';

import { ReactNode, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // For the login page, we don't want the admin header/layout shell.
  // By returning only the children, we prevent layout-related errors on this specific page.
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // For all other admin pages, render the layout with a loading state to prevent hydration errors.
  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        {!isClient ? (
          // Skeleton loader to show on initial server render and prevent hydration mismatch
          <CardHeader className="flex flex-row items-center justify-between">
            <Skeleton className="h-8 w-64" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-10 w-32" />
            </div>
          </CardHeader>
        ) : (
          // Actual content, rendered only on the client after hydration
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-2xl font-headline">
              {(() => {
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
              })()}
            </CardTitle>
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
        )}
      </Card>
      {children}
    </div>
  );
}
