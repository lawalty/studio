
import type { Message } from '@/app/page';
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"; 
import ChatBubble from "./ChatBubble";
import React, { useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bot } from 'lucide-react';

interface ConversationLogProps {
  messages: Message[];
  isLoadingAiResponse: boolean;
  avatarSrc: string;
}

export default function ConversationLog({ messages, isLoadingAiResponse, avatarSrc }: ConversationLogProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null); 

  useEffect(() => {
    const scrollToBottom = () => {
      if (viewportRef.current) {
        viewportRef.current.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' });
      }
    };

    // Attempt to scroll immediately
    scrollToBottom();

    // And also ensure it scrolls after a very brief delay to catch any pending DOM updates.
    // This can help if scrollHeight isn't updated immediately for the first call.
    const timerId = setTimeout(scrollToBottom, 0);

    return () => clearTimeout(timerId);
  }, [messages, isLoadingAiResponse]);

  const DEFAULT_AVATAR_PLACEHOLDER_TYPING = "https://placehold.co/40x40.png";

  return (
    <ScrollArea
      className="h-[calc(100vh-280px)] md:h-[calc(100vh-240px)] w-full rounded-md border border-border p-4 shadow-inner bg-card"
      ref={scrollAreaRef}
    >
      <div ref={viewportRef} className="h-full w-full" data-testid="conversation-log-viewport"> 
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} avatarSrc={avatarSrc} />
        ))}
        {isLoadingAiResponse && messages.length > 0 && (
          <div className="flex mb-4 items-end animate-in fade-in duration-300 justify-start">
             <Avatar className="h-8 w-8 mr-2 self-start">
                {avatarSrc && !avatarSrc.startsWith('https://placehold.co') ? (
                    <AvatarImage src={avatarSrc} alt="AI Avatar Typing" className="object-cover"/>
                ) : (
                    <AvatarImage src={DEFAULT_AVATAR_PLACEHOLDER_TYPING} alt="AI Avatar Placeholder Typing" data-ai-hint="professional woman" />
                )}
                <AvatarFallback><Bot size={20}/></AvatarFallback>
            </Avatar>
            <div className="max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg shadow bg-secondary text-secondary-foreground rounded-bl-none animate-pulse">
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
      <ScrollBar orientation="vertical" /> 
    </ScrollArea>
  );
}
