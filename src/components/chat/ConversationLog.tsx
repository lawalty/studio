import type { Message } from '@/components/chat/ChatInterface';
import { ScrollArea } from "@/components/ui/scroll-area";
import ChatBubble from "./ChatBubble";
import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    translate('Start the conversation by typing or using the microphone.').then(setEmptyMessage);
  }, [translate]);

  const scrollAreaRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  return (
    <ScrollArea
      className="h-[calc(100vh-280px)] md:h-[calc(100vh-240px)] w-full rounded-md border border-border p-4 shadow-inner bg-card"
      data-testid="conversation-log-scroll-area"
      viewportRef={scrollAreaRef}
    >
        <div className="h-full">
            {messages.map((msg) => (
              <ChatBubble 
                key={msg.id} 
                message={msg} 
                avatarSrc={avatarSrc}
              />
            ))}
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">{emptyMessage}</p>
              </div>
            )}
        </div>
    </ScrollArea>
  );
}

    