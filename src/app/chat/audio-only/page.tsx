'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const ChatInterface = dynamic(() => import('../../components/chat/ChatInterface'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full text-center py-8">
      <Skeleton className="h-[200px] w-[200px] rounded-full" />
      <Skeleton className="h-8 w-64 mt-6" />
      <Skeleton className="h-12 w-80 mt-4" />
    </div>
  ),
});

export default function AudioOnlyPage() {
  return (
    <div className="flex flex-col h-full flex-grow">
      <ChatInterface communicationMode="audio-only" />
    </div>
  );
}
