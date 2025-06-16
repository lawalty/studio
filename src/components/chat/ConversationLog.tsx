
import type { Message } from '@/app/page';
import { ScrollArea, ScrollBar, ScrollAreaPrimitive } from "@/components/ui/scroll-area";
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
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const scrollToTop = () => {
      viewport.scrollTop = 0; // Scroll to the visual top
    };

    // Scroll immediately on update
    scrollToTop();

    // And again using requestAnimationFrame to ensure it happens after layout/paint
    const animationFrameId = requestAnimationFrame(scrollToTop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [messages, isLoadingAiResponse]); // Trigger on these changes

  const DEFAULT_AVATAR_PLACEHOLDER_TYPING = "https://placehold.co/40x40.png";

  return (
    <ScrollArea
      className="h-[calc(100vh-280px)] md:h-[calc(100vh-240px)] w-full rounded-md border border-border p-4 shadow-inner bg-card"
    >
      <ScrollAreaPrimitive.Viewport
        className="h-full w-full rounded-[inherit]"
        ref={viewportRef}
        data-testid="conversation-log-viewport"
      >
        <div className="flex flex-col-reverse"> {/* Main container for reversing children */}
          {/*
            Order of elements here is "logical" - what would be at the bottom if appending normally.
            `flex-col-reverse` makes the last item in this source order appear at the visual top.
          */}

          {/* Empty state: If it's the only thing, it appears at the top. */}
          {messages.length === 0 && !isLoadingAiResponse && (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Start the conversation by typing or using the microphone.</p>
            </div>
          )}

          {/* Typing Indicator: If active, it's "newer" than messages, so it comes after them in source,
              making it appear above them visually.
          */}
          {isLoadingAiResponse && (
            <div className="flex w-full items-end animate-in fade-in duration-300 justify-start">
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

          {/* Messages: Mapped in natural order (oldest to newest).
              The newest message (last in map) will be just below typing indicator, or at the top.
          */}
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} avatarSrc={avatarSrc} />
          ))}
        </div>
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation="vertical" />
    </ScrollArea>
  );
}
