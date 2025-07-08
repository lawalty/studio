'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Home, LogOut, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.uid === 'admin-uid') {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        // Avoid redirect loop
        if (pathname !== '/admin/login') {
            router.replace('/admin/login');
        }
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [router, pathname]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({ title: "Logged Out", description: "You have been successfully logged out." });
      router.push('/admin/login');
    } catch (error) {
      console.error("Logout error:", error);
      toast({ title: "Logout Failed", description: "Could not log out. Please try again.", variant: "destructive" });
    }
  };

  // While checking auth, show a loader.
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }
  
  // If user is not authenticated and not on the login page, show loader during redirect.
  if (!isAuthenticated && pathname !== '/admin/login') {
    return (
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
    );
  }

  // If on login page, render children without the layout shell.
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }
  
  // If authenticated, show the full admin layout.
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
        <Button onClick={handleLogout} variant="outline">
            <LogOut className="mr-2 h-4 w-4" />
            Logout
        </Button>
      </div>
      {isAuthenticated ? children : null}
    </div>
  );
}
