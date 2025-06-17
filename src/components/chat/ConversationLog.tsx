
import type { Message } from '@/app/page';
import { ScrollArea, ScrollBar, ScrollAreaPrimitive } from "@/components/ui/scroll-area";
import ChatBubble from "./ChatBubble";
import React, { useEffect, useRef } from 'react';

interface ConversationLogProps {
  messages: Message[];
  avatarSrc: string;
}

export default function ConversationLog({ messages, avatarSrc }: ConversationLogProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // Always scroll to top for new messages when using flex-col-reverse
    const scrollToTop = () => {
      viewport.scrollTop = 0; 
    };
    
    // Using requestAnimationFrame can help ensure scrolling happens after layout
    const animationFrameId = requestAnimationFrame(scrollToTop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [messages]); // Re-run when messages change

  return (
    <ScrollArea
      className="h-[calc(100vh-280px)] md:h-[calc(100vh-240px)] w-full rounded-md border border-border p-4 shadow-inner bg-card"
    >
      <ScrollAreaPrimitive.Viewport
        className="h-full w-full rounded-[inherit] flex flex-col-reverse" // Key: flex-col-reverse
        ref={viewportRef}
        data-testid="conversation-log-viewport"
      >
        {/* Render messages in natural order; flex-col-reverse handles visual order */}
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} avatarSrc={avatarSrc} />
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
