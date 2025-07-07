
import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Cog } from 'lucide-react';
import UpdatesComingContent from '@/components/page-content/UpdatesComingContent';


function UpdatesComingFallback() {
    return (
        <div className="relative flex flex-col items-center justify-center flex-grow p-4">
            <Card className="w-full max-w-lg p-6 space-y-6 text-center shadow-2xl border bg-card/80 backdrop-blur-sm">
                <CardHeader className="p-0">
                    <div className="flex justify-center items-center gap-3">
                        <Cog className="h-8 w-8 text-primary animate-spin-slow" />
                        <CardTitle className="text-3xl font-headline text-primary">Updates Are Coming!</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="p-0 space-y-6">
                    <Skeleton className="w-full h-[267px] rounded-lg" />
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-3/4 mx-auto" />
                        <Skeleton className="h-4 w-1/2 mx-auto" />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function UpdatesComingPage() {
    return (
        <Suspense fallback={<UpdatesComingFallback />}>
            <UpdatesComingContent />
        </Suspense>
    );
}
