
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // This effect runs on the client after the component mounts.
    // It checks for the authentication token in sessionStorage.
    const isAuthenticated = sessionStorage.getItem('isAdminAuthenticated') === 'true';

    if (!isAuthenticated) {
      // If not authenticated, redirect to the login page.
      router.replace('/admin/login');
    } else {
      // If authenticated, stop loading and allow content to render.
      setIsLoading(false);
    }
  }, [pathname, router]); // Re-run this check if the user navigates to a new admin page.

  // The login page does not need the admin layout, so we render its children directly.
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // If we are still verifying the token, show the loading screen.
  // This prevents rendering the admin UI before access is confirmed.
  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Verifying Access...</p>
      </div>
    );
  }
  
  // If we reach here, the user is authenticated and not loading. Render the full admin layout.
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
