
import type { Message } from '@/app/page';
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"; // Ensure ScrollBar is imported if used structurally
import ChatBubble from "./ChatBubble";
import React, { useEffect, useRef } from 'react';

interface ConversationLogProps {
  messages: Message[];
  isLoadingAiResponse: boolean;
  avatarSrc: string;
}

export default function ConversationLog({ messages, isLoadingAiResponse, avatarSrc }: ConversationLogProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null); // Ref for the viewport

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoadingAiResponse]);

  return (
    <ScrollArea
      className="h-[calc(100vh-280px)] md:h-[calc(100vh-240px)] w-full rounded-md border border-border p-4 shadow-inner bg-card"
      ref={scrollAreaRef}
    >
      <div ref={viewportRef} className="h-full w-full" data-testid="conversation-log-viewport"> {/* Added data-testid here */}
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} avatarSrc={avatarSrc} />
        ))}
        {isLoadingAiResponse && (
          <div className="flex items-center justify-start mb-4">
            {/* Using a simplified structure for the typing indicator to avoid avatar issues in PDF if it's complex */}
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
      </div>
      <ScrollBar orientation="vertical" /> {/* Explicitly add ScrollBar if needed by ScrollArea structure */}
    </ScrollArea>
  );
}
