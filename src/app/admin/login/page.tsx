'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound } from 'lucide-react';

export default function AdminLoginPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-muted">
      <Card className="w-full max-w-sm shadow-2xl">
        <CardHeader className="text-center">
          <KeyRound className="mx-auto h-12 w-12 text-primary" />
          <CardTitle className="mt-4 text-2xl font-headline">Admin Access</CardTitle>
          <CardDescription>
            Admin login is temporarily disabled for development. You can access the admin pages directly.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <p className="text-center text-sm text-muted-foreground">
              Navigate to <a href="/admin" className="underline">/admin</a> to continue.
           </p>
        </CardContent>
      </Card>
    </div>
  );
}
