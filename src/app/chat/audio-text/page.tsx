
'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const ChatInterface = dynamic(() => import('@/components/chat/ChatInterface'), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
      <div className="md:col-span-1 flex flex-col items-center md:items-start space-y-4">
        <div className="w-full p-6 flex flex-col items-center">
            <Skeleton className="h-[120px] w-[120px] rounded-full" />
            <Skeleton className="h-7 w-48 mt-4" />
        </div>
      </div>
      <div className="md:col-span-2 flex flex-col h-full">
          <Skeleton className="h-full w-full" />
          <div className="mt-4 flex items-center gap-2">
            <Skeleton className="h-10 flex-grow" />
            <Skeleton className="h-10 w-10" />
          </div>
      </div>
    </div>
  ),
});

export default function AudioTextPage() {
  return (
    <main className="flex-grow container mx-auto px-4 py-8 flex flex-col">
      <ChatInterface communicationMode="audio-text" />
    </main>
  );
}
