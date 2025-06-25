
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isVerificationComplete, setIsVerificationComplete] = useState(false);

  useEffect(() => {
    // sessionStorage is only available on the client side.
    // This effect checks for the auth token and updates the state.
    const authStatus = sessionStorage.getItem('isAdminAuthenticated');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
    // Mark verification as complete so we can decide whether to render or redirect.
    setIsVerificationComplete(true);
  }, []);

  useEffect(() => {
    // This effect handles redirection after verification is complete.
    if (isVerificationComplete && !isAuthenticated && pathname !== '/admin/login') {
      router.replace('/admin/login');
    }
  }, [isVerificationComplete, isAuthenticated, pathname, router]);

  // On the login page, we don't need to show the layout or run further checks.
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // While verification is in progress, or if we need to redirect, show a loader.
  // This prevents a flash of the admin panel before the redirect happens.
  if (!isVerificationComplete || !isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Verifying Access...</p>
      </div>
    );
  }
  
  // If authenticated and verified, render the full admin layout.
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
