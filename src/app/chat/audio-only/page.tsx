
'use client';

import ChatInterface from '@/components/chat/ChatInterface';

export default function AudioOnlyPage() {
  return (
    <div className="flex flex-col h-full flex-grow items-center justify-center">
      <ChatInterface communicationMode="audio-only" />
    </div>
  );
}
