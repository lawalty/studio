import type { Message, CommunicationMode } from '@/components/chat/ChatInterface';
import { ScrollArea, ScrollBar, ScrollAreaPrimitive } from "@/components/ui/scroll-area";
import ChatBubble from "./ChatBubble";
import React, { useEffect, useRef } from 'react';

interface ConversationLogProps {
  messages: Message[]; 
  avatarSrc: string;
  typingSpeedMs: number;
  animationSyncFactor: number;
  communicationMode: CommunicationMode;
  lastOverallMessageId: string | null; 
  hasConversationEnded: boolean;
  forceFinishAnimationForMessageId: string | null; 
}

export default function ConversationLog({ 
  messages, 
  avatarSrc,
  typingSpeedMs,
  animationSyncFactor,
  communicationMode,
  lastOverallMessageId,
  hasConversationEnded,
  forceFinishAnimationForMessageId 
}: ConversationLogProps) {
  const viewportRef = useRef&lt;HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const scrollToBottom = () => {
      viewport.scrollTop = viewport.scrollHeight; 
    };
    
    const animationFrameId = requestAnimationFrame(scrollToBottom);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [messages]); 

  return (
    &lt;ScrollArea
      className="h-[calc(100vh-280px)] md:h-[calc(100vh-240px)] w-full rounded-md border border-border p-4 shadow-inner bg-card"
    >
      &lt;ScrollAreaPrimitive.Viewport
        className="h-full w-full rounded-[inherit]" 
        ref={viewportRef}
        data-testid="conversation-log-viewport"
      >
        {messages.map((msg) => (
          &lt;ChatBubble 
            key={msg.id} 
            message={msg} 
            avatarSrc={avatarSrc}
            typingSpeedMs={typingSpeedMs}
            animationSyncFactor={animationSyncFactor}
            communicationMode={communicationMode}
            isNewlyAddedAiMessage={msg.sender === 'ai' && msg.id === lastOverallMessageId && !hasConversationEnded}
            forceFinishAnimation={forceFinishAnimationForMessageId === msg.id}
          />
        ))}
        {messages.length === 0 && (
          &lt;div className="flex items-center justify-center h-full">
            &lt;p className="text-muted-foreground">Start the conversation by typing or using the microphone.&lt;/p>
          &lt;/div>
        )}
      &lt;/ScrollAreaPrimitive.Viewport>
      &lt;ScrollBar orientation="vertical" />
    &lt;/ScrollArea>
  );
}
