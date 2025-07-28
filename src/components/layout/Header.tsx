
'use client';

import Link from 'next/link';
import { Bot, Home, LayoutDashboard, LogOut } from 'lucide-react';
import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getAuth, signOut } from 'firebase/auth';
import { app } from '@/lib/firebase';
import { Button } from '@/components/ui/button';

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const isAdminPage = pathname.startsWith('/admin') && pathname !== '/admin/login';

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
    <header className="bg-card border-b border-border">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-primary hover:text-accent transition-colors">
          <Bot size={28} />
          <h1 className="text-2xl font-bold font-headline">AI Chat EZCORP</h1>
        </Link>

        {isAdminPage && (
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Admin Console
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                App Front End
              </Link>
            </Button>
            <Button onClick={handleLogout} variant="default" size="sm">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
