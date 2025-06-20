
'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation'; // Import usePathname
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname(); // Get the current path
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // sessionStorage is only available on the client
    if (typeof window !== 'undefined') {
      // If we are on the login page, we don't need to do auth checks here.
      // The login page will handle setting the session storage.
      // We just need to stop our loading state to let the login page render.
      if (pathname === '/admin/login') {
        setIsLoading(false);
        // isAuthenticated can remain false for the login page itself
        return;
      }

      const authStatus = sessionStorage.getItem('isAdminAuthenticated');
      if (authStatus !== 'true') {
        router.replace('/admin/login');
      } else {
        setIsAuthenticated(true);
      }
      setIsLoading(false);
    }
  }, [router, pathname]); // Add pathname to dependency array

  // If it's the login page, just render its content directly
  // without the admin panel's header or further checks from this layout.
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading Admin Panel...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // This block will show "Redirecting to login..." if isLoading is false,
    // isAuthenticated is false, and we are NOT on the /admin/login page.
    // This is the expected behavior while the redirect to /admin/login happens.
    return (
       <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Redirecting to login...</p>
      </div>
    );
  }

  // If authenticated, not loading, and not on the login page:
  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-2xl font-headline">Admin Panel</CardTitle>
          <Button variant="outline" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" /> Home / AI Blair
            </Link>
          </Button>
        </CardHeader>
      </Card>
      {children}
    </div>
  );
}
