import type { Message } from '@/app/page';
import { ScrollArea } from "@/components/ui/scroll-area";
import ChatBubble from "./ChatBubble";
import React, { useEffect, useRef } from 'react';

interface ConversationLogProps {
  messages: Message[];
  isLoadingAiResponse: boolean;
}

export default function ConversationLog({ messages, isLoadingAiResponse }: ConversationLogProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <ScrollArea className="h-[calc(100vh-280px)] md:h-[calc(100vh-240px)] w-full rounded-md border border-border p-4 shadow-inner bg-card" ref={scrollAreaRef}>
      {messages.map((msg) => (
        <ChatBubble key={msg.id} message={msg} />
      ))}
      {isLoadingAiResponse && (
        <div className="flex items-center justify-start mb-4">
           <div className="p-3 rounded-lg bg-secondary text-secondary-foreground shadow rounded-bl-none animate-pulse">
            <p className="text-sm">AI Blair is typing...</p>
          </div>
        </div>
      )}
      {messages.length === 0 && !isLoadingAiResponse && (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Start the conversation by typing or using the microphone.</p>
        </div>
      )}
    </ScrollArea>
  );
}
