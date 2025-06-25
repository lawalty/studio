'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LogIn } from 'lucide-react';

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-headline">Admin Panel</CardTitle>
          <CardDescription>
            Password protection is temporarily disabled. Click below to enter the admin area.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild size="lg">
            <Link href="/admin">
              <LogIn className="mr-2 h-4 w-4" />
              Enter Admin Panel
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
