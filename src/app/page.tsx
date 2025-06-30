
'use client';

import { CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SuccessPage() {
  return (
    <div className="flex flex-col items-center justify-center flex-grow p-8">
      <Card className="w-full max-w-lg text-center shadow-2xl">
        <CardHeader>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="mt-4 text-3xl font-headline text-primary">
            Application Published!
          </CardTitle>
          <CardDescription className="mt-2 text-base text-muted-foreground">
            The core application is running successfully. This confirms the
            deployment and server configuration are correct.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            The AI functionality was temporarily disabled to achieve this successful
            deployment. The next step is to methodically re-enable the AI
            features to pinpoint the source of the runtime error.
          </p>
          <p className="text-sm font-semibold">
            Your original landing page code is safely backed up in{' '}
            <code className="bg-muted px-1 py-0.5 rounded">
              /src/app/temp-start/page.tsx
            </code>
            .
          </p>
          <div className="border-t pt-4">
            <Button asChild variant="outline">
              <Link href="/admin">Go to Admin Console</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
