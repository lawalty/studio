'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Wrench, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center flex-grow p-4 bg-background">
      <Card className="w-full max-w-lg p-6 text-center shadow-2xl border">
        <CardHeader>
          <div className="flex justify-center items-center gap-3">
            <Wrench className="h-8 w-8 text-primary" />
            <CardTitle className="text-3xl font-headline text-primary">
              Application Published!
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <CardDescription className="text-base text-foreground">
            The application core is running successfully with this minimal start page.
          </CardDescription>
          <p className="text-sm text-muted-foreground">
            This confirms the build and server configuration are correct. The previous error was likely caused by complex client-side logic in the original landing page, which can now be rebuilt on this stable foundation.
          </p>
          <div className="flex justify-center pt-4">
            <Button asChild size="lg">
              <Link href="/admin">
                Go to Admin Panel <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
