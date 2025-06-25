
'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LayoutDashboard, Loader2 } from 'lucide-react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null); // null = pending check

  useEffect(() => {
    // This effect runs once on the client to check the authentication status.
    const authStatus = sessionStorage.getItem('isAdminAuthenticated') === 'true';
    setIsAuthenticated(authStatus);
  }, []);

  useEffect(() => {
    // This effect handles redirection if authentication status changes and is not yet true.
    if (isAuthenticated === false && pathname !== '/admin/login') {
      router.replace('/admin/login');
    }
  }, [isAuthenticated, pathname, router]);

  // The login page is a special case and does not need the admin layout or auth check.
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // If authentication is not confirmed yet (null) or is false, show a loader.
  // This prevents any child components (the actual admin pages) from attempting
  // to render before authentication is successful, which resolves the ChunkLoadError.
  if (isAuthenticated !== true) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Verifying Access...</p>
      </div>
    );
  }

  // If we reach here, the user is authenticated. Render the full admin layout.
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
