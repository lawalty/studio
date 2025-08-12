'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { app } from '@/lib/firebase'; 
import AdminNav from '@/components/admin/AdminNav';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  
  const isAdminPage = pathname.startsWith('/admin');
  const isLoginPage = pathname === '/admin/login';
  const showAdminNav = isAdminPage && !isLoginPage;

  useEffect(() => {
    let auth: any;
    try {
      if (app) {
        auth = getAuth(app);
      } else {
        throw new Error("Firebase app is not initialized.");
      }
    } catch (e) {
      console.error("Firebase not initialized, cannot set up auth listener.", e);
      setIsLoading(false);
      if (!isLoginPage) {
        router.replace('/admin/login');
      }
      return;
    }
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);
      if (!currentUser && !isLoginPage) {
        router.replace('/admin/login');
      }
    });

    return () => unsubscribe();
  }, [router, isLoginPage]);


  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Verifying authentication...</p>
      </div>
    );
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!user) {
    return (
        <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2">Redirecting to login...</p>
        </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {children}
    </div>
  );
}
