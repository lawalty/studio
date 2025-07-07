import type { Message, CommunicationMode } from '@/components/chat/ChatInterface';
import { ScrollArea, ScrollBar, ScrollAreaPrimitive } from "@/components/ui/scroll-area";
import ChatBubble from "./ChatBubble";
import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';

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
  const viewportRef = useRef<HTMLDivElement>(null);
  const { translate } = useLanguage();
  const [emptyMessage, setEmptyMessage] = useState('Start the conversation by typing or using the microphone.');

  useEffect(() => {
    translate('Start the conversation by typing or using the microphone.').then(setEmptyMessage);
  }, [translate]);

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
    <ScrollArea
      className="h-[calc(100vh-280px)] md:h-[calc(100vh-240px)] w-full rounded-md border border-border p-4 shadow-inner bg-card"
    >
      <ScrollAreaPrimitive.Viewport
        className="h-full w-full rounded-[inherit]" 
        ref={viewportRef}
        data-testid="conversation-log-viewport"
      >
        {messages.map((msg) => (
          <ChatBubble 
            key={msg.id} 
            message={msg} 
            avatarSrc={avatarSrc}
            typingSpeedMs={typingSpeedMs}
            animationSyncFactor={animationSyncFactor}
            communicationMode={communicationMode}
            isNewlyAddedAiMessage={msg.sender === 'model' && msg.id === lastOverallMessageId && !hasConversationEnded}
            forceFinishAnimation={forceFinishAnimationForMessageId === msg.id}
          />
        ))}
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">{emptyMessage}</p>
          </div>
        )}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation="vertical" />
    </ScrollArea>
  );
}
