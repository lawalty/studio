
import { Suspense } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import StartPageContent from '@/components/page-content/StartPageContent';

function StartPageFallback() {
  return (
    <div className="relative flex flex-col items-center justify-center flex-grow p-4">
        <Card className="w-full max-w-lg p-6 text-center shadow-2xl border bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <Skeleton className="h-8 w-3/4 mx-auto" />
            <Skeleton className="h-6 w-1/2 mx-auto mt-2" />
          </CardHeader>
          <CardContent className="space-y-6 mt-6">
            <Skeleton className="w-full h-[267px] rounded-lg" />
            <Skeleton className="h-6 w-3/4 mx-auto" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </CardContent>
        </Card>
    </div>
  );
}


export default function Page() {
  return (
    <Suspense fallback={<StartPageFallback />}>
      <StartPageContent />
    </Suspense>
  );
}
