
import type { Message } from '@/app/page';
import { ScrollArea, ScrollBar, ScrollAreaPrimitive } from "@/components/ui/scroll-area";
import ChatBubble from "./ChatBubble";
import React, { useEffect, useRef } from 'react';

interface ConversationLogProps {
  messages: Message[]; // This will be displayedMessages from page.tsx
  avatarSrc: string;
  textAnimationEnabled: boolean;
  textAnimationSpeedMs: number;
  lastOverallMessageId: string | null; // To help ChatBubble decide if it's the newest AI message
  hasConversationEnded: boolean;
}

export default function ConversationLog({ 
  messages, 
  avatarSrc,
  textAnimationEnabled,
  textAnimationSpeedMs,
  lastOverallMessageId,
  hasConversationEnded 
}: ConversationLogProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // Always scroll to the bottom of the current content.
    // For full log, this shows the latest messages.
    // For 1-2 item view, this ensures they are visible if viewport is constrained.
    const scrollToBottom = () => {
      viewport.scrollTop = viewport.scrollHeight; 
    };
    
    const animationFrameId = requestAnimationFrame(scrollToBottom);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [messages]); 

  return (
    <ScrollArea
      className="h-[calc(100vh-280px)] md:h-[calc(100vh-240px)] w-full rounded-md border border-border p-4 shadow-inner bg-card"
    >
      <ScrollAreaPrimitive.Viewport
        className="h-full w-full rounded-[inherit]" // Removed flex-col-reverse
        ref={viewportRef}
        data-testid="conversation-log-viewport"
      >
        {messages.map((msg) => (
          <ChatBubble 
            key={msg.id} 
            message={msg} 
            avatarSrc={avatarSrc}
            textAnimationEnabled={textAnimationEnabled}
            textAnimationSpeedMs={textAnimationSpeedMs}
            isNewlyAddedAiMessage={msg.sender === 'ai' && msg.id === lastOverallMessageId && !hasConversationEnded}
          />
        ))}
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Start the conversation by typing or using the microphone.</p>
          </div>
        )}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation="vertical" />
    </ScrollArea>
  );
}

    