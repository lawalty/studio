'use client';

import ChatInterface from '@/components/chat/ChatInterface';

export default function TextOnlyPage() {
  return (
    <div className="flex flex-col h-full flex-grow p-4 md:p-8">
      <ChatInterface communicationMode="text-only" />
    </div>
  );
}
