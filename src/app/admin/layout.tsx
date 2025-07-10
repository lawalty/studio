
'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getAuth, onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Home, LogOut, Loader2 } from 'lucide-react';
import { app } from '@/lib/firebase'; 

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  
  const isAuthPage = pathname === '/admin/login' || pathname === '/admin/register';

  useEffect(() => {
    const initializeAuthListener = () => {
      if (!app || !app.options.apiKey) {
        console.error("Firebase app is not initialized.");
        setIsLoading(false);
        if (!isAuthPage) {
            router.replace('/admin/login');
        }
        return () => {};
      }

      const auth = getAuth(app);
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        if (!currentUser && !isAuthPage) {
          router.replace('/admin/login');
        }
        setIsLoading(false);
      });

      return unsubscribe;
    };
    
    const unsubscribe = initializeAuthListener();
    return () => unsubscribe();
  }, [router, pathname, isAuthPage]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Verifying authentication...</p>
      </div>
    );
  }

  // If on a login or register page, just render the page itself.
  if (isAuthPage) {
    return <>{children}</>;
  }

  // If not on an auth page and there is no user, show a loading state while redirecting.
  if (!user) {
    return (
        <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2">Redirecting to login...</p>
        </div>
    );
  }

  // If we have a user and are not on an auth page, render the full admin layout.
  const handleLogout = async () => {
    try {
      const auth = getAuth(app);
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
