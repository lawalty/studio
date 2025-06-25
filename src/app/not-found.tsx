
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground text-center p-4">
      <div className="flex items-center space-x-4 text-4xl font-bold text-primary mb-4">
        <span>404</span>
        <div className="h-10 w-px bg-border"></div>
        <span>Page Not Found</span>
      </div>
      <p className="text-lg text-muted-foreground mb-8">
        Sorry, the page you are looking for does not exist or has been moved.
      </p>
      <Button asChild>
        <Link href="/">
          <Home className="mr-2 h-4 w-4" />
          Go back home
        </Link>
      </Button>
    </div>
  );
}
