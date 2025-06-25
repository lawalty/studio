
import type { Message } from '@/app/page';
import { cn } from "@/lib/utils";
import { User, Bot, Download } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import React, { useEffect, useRef, useState } from 'react';

interface ChatBubbleProps {
  message: Message;
  avatarSrc: string;
  typingSpeedMs: number;
  isNewlyAddedAiMessage: boolean;
  forceFinishAnimation: boolean;
}

export default function ChatBubble({
  message,
  avatarSrc,
  typingSpeedMs,
  isNewlyAddedAiMessage,
  forceFinishAnimation
}: ChatBubbleProps) {
  const isUser = message.sender === 'user';
  const DEFAULT_AVATAR_PLACEHOLDER = "https://placehold.co/40x40.png";
  const [displayedText, setDisplayedText] = useState('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // This effect handles the typing animation
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const fullText = message.text.replace(/\*\*/g, '\n\n');

    if (message.sender === 'ai' && isNewlyAddedAiMessage && !forceFinishAnimation) {
      let i = 0;
      setDisplayedText('');

      const type = () => {
        if (i < fullText.length) {
          setDisplayedText(prev => prev + fullText.charAt(i));
          i++;
          // Add randomness to the delay to make it feel more natural
          const randomDelay = typingSpeedMs + (Math.random() - 0.5) * (typingSpeedMs * 0.5);
          timeoutRef.current = setTimeout(type, Math.max(10, randomDelay)); // Ensure a minimum delay
        }
      };

      // Start the typing animation
      timeoutRef.current = setTimeout(type, typingSpeedMs);
    } else {
      // If it's not a new AI message or animation is forced, show the full text immediately.
      setDisplayedText(fullText);
    }

    return () => {
      // Cleanup: clear any pending timeout when the component unmounts or re-renders.
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, isNewlyAddedAiMessage]); // Rerun effect when the message or its 'newly added' status changes.

  useEffect(() => {
    // This effect handles forcing the animation to finish.
    if (forceFinishAnimation) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setDisplayedText(message.text.replace(/\*\*/g, '\n\n'));
    }
  }, [forceFinishAnimation, message.text]);
  
  const renderPdfLink = () => {
    if (message.sender === 'ai' && message.pdfReference?.downloadURL) {
      return (
        <a
          href={message.pdfReference.downloadURL}
          target="_blank"
          rel="noopener noreferrer"
          download={message.pdfReference.fileName}
          className="mt-2 inline-flex items-center gap-2 rounded-md bg-accent/50 px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent"
        >
          <Download className="h-3 w-3" />
          Download: {message.pdfReference.fileName}
        </a>
      );
    }
    return null;
  };

  return (
    <div className={cn("flex mb-4 items-end animate-in fade-in duration-300", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <Avatar className="h-8 w-8 mr-2 self-start">
          {avatarSrc && !avatarSrc.startsWith('https://placehold.co') ? (
             <AvatarImage src={avatarSrc} alt="AI Avatar" className="object-cover"/>
          ) : (
             <AvatarImage src={DEFAULT_AVATAR_PLACEHOLDER} alt="AI Avatar Placeholder" data-ai-hint="professional woman" />
          )}
          <AvatarFallback><Bot size={20}/></AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg shadow flex flex-col",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-none"
            : "bg-secondary text-secondary-foreground rounded-bl-none"
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{displayedText}</p>
        {renderPdfLink()}
        <p className={cn("text-xs mt-1", isUser ? "text-primary-foreground/70 text-right" : "text-muted-foreground text-left")}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      {isUser && (
         <Avatar className="h-8 w-8 ml-2 self-start">
          <AvatarFallback><User size={20}/></AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
