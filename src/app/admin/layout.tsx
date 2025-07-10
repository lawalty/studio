
'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Home, LogOut, Loader2 } from 'lucide-react';
import { app } from '@/lib/firebase'; // Ensure app is initialized

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const auth = getAuth(app);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        if (pathname !== '/admin/login') {
          router.replace('/admin/login');
        }
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [auth, router, pathname]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Verifying authentication...</p>
      </div>
    );
  }

  // If on the login page, just render the children (the login form) without the layout wrapper.
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }


  if (!isAuthenticated) {
    // This part is a fallback while redirecting for non-login pages.
    return null;
  }

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/admin/login');
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };


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
        <Button onClick={handleLogout} variant="destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
      {children}
    </div>
  );
}
