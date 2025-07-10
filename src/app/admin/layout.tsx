
'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Home, LogOut, Loader2 } from 'lucide-react';
import { app } from '@/lib/firebase'; // Ensure app is initialized

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const auth = getAuth(app);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // We can perform a more robust check here if needed,
        // e.g., by checking a custom claim on the token.
        // For now, any signed-in user is considered authenticated.
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        router.replace('/admin/login');
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [auth, router]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/admin/login');
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Verifying authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // This part is mainly a fallback while redirecting.
    // The main redirect logic is in the useEffect hook.
    return null;
  }

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
