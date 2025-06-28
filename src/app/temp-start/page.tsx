
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Wrench } from 'lucide-react';

export default function TemporaryStartPage() {
  return (
    <div className="flex flex-col items-center justify-center flex-grow p-4">
      <Card className="w-full max-w-lg p-6 text-center shadow-2xl border">
        <CardHeader>
          <div className="flex justify-center items-center gap-3">
            <Wrench className="h-8 w-8 text-primary" />
            <CardTitle className="text-3xl font-headline text-primary">
              Temporary Test Page
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <CardDescription className="text-base text-foreground">
            The server is running successfully with a minimal page.
          </CardDescription>
          <p className="text-sm text-muted-foreground">
            This confirms the core application and server configuration are working. The issue is likely within the components or data-loading logic of the original start page (`src/app/page.tsx`).
          </p>
          <p className="font-semibold">Next, we can start debugging that page.</p>
        </CardContent>
      </Card>
    </div>
  );
}
