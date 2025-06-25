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
  // This state now tracks if the authentication check is complete.
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    const isAuthenticated = sessionStorage.getItem('isAdminAuthenticated') === 'true';

    // If the user is not authenticated and not already on the login page, redirect them.
    if (!isAuthenticated && pathname !== '/admin/login') {
      router.replace('/admin/login');
    } else {
      // Otherwise, the check is complete, and we can proceed.
      setIsVerified(true);
    }
  }, [pathname, router]);

  // The login page is a special case and does not need the admin layout or auth check.
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // For all other admin pages, show a loading screen until the verification is complete.
  // This prevents rendering children until we know the user is authenticated.
  if (!isVerified) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Verifying Access...</p>
      </div>
    );
  }

  // If we reach here, the user is verified and authenticated. Render the full admin layout.
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
