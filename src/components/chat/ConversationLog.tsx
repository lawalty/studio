import type { Message } from '@/components/chat/ChatInterface';
import { ScrollArea } from "@/components/ui/scroll-area";
import ChatBubble from "./ChatBubble";
import React, { useEffect, useState, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';

interface ConversationLogProps {
  messages: Message[]; 
  avatarSrc: string;
}

export default function ConversationLog({ 
  messages, 
  avatarSrc,
}: ConversationLogProps) {
  const { translate } = useLanguage();
  const [emptyMessage, setEmptyMessage] = useState('Start the conversation by typing or using the microphone.');
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    translate('Start the conversation by typing or using the microphone.').then(setEmptyMessage);
  }, [translate]);

  useEffect(() => {
    // Correctly access the viewport element within the ScrollArea component
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: 'smooth',
        });
      }
    }
  }, [messages]);

  return (
    <ScrollArea
      ref={scrollAreaRef}
      className="h-[calc(100vh-280px)] md:h-[calc(100vh-240px)] w-full rounded-md border border-border p-4 shadow-inner bg-card"
      data-testid="conversation-log-scroll-area"
    >
        <div className="h-full">
            {messages.length > 0 ? (
                messages.map((msg) => (
                    <ChatBubble 
                        key={msg.id} 
                        message={msg} 
                        avatarSrc={avatarSrc}
                    />
                ))
            ) : (
                <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground">{emptyMessage}</p>
                </div>
            )}
        </div>
    </ScrollArea>
  );
}
