
'use client';

import type { Message } from '@/components/chat/ChatInterface';
import { cn } from "@/lib/utils";
import { User, Bot, Download } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import React, { useEffect, useRef, useState } from 'react';

// New helper function to parse basic markdown (**bold**) and newlines
const renderTextWithMarkdown = (text: string): JSX.Element => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        // Handle newlines within normal text parts
        return part.split('\n').map((line, lineIndex, arr) => (
          <React.Fragment key={`${index}-${lineIndex}`}>
            {line}
            {lineIndex < arr.length - 1 && <br />}
          </React.Fragment>
        ));
      })}
    </>
  );
};


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
  
  // State to hold the plain text being animated
  const [animatedText, setAnimatedText] = useState('');
  // State to control whether we show the animation or the final formatted text
  const [isAnimating, setIsAnimating] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const shouldAnimate = message.sender === 'ai' && isNewlyAddedAiMessage;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (shouldAnimate) {
      setIsAnimating(true);
      // Clean the text for animation (remove markdown characters)
      const textToAnimate = message.text.replace(/\*\*/g, '');
      let i = 0;
      setAnimatedText('');

      const type = () => {
        if (i < textToAnimate.length) {
          setAnimatedText(prev => prev + textToAnimate.charAt(i));
          i++;
          const randomDelay = typingSpeedMs + (Math.random() - 0.5) * (typingSpeedMs * 0.5);
          timeoutRef.current = setTimeout(type, Math.max(10, randomDelay));
        } else {
          // Animation finished, switch to showing the final formatted content
          setIsAnimating(false);
        }
      };
      timeoutRef.current = setTimeout(type, typingSpeedMs);
    } else {
      setIsAnimating(false);
      setAnimatedText(''); // Not animating, so this is not needed
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, isNewlyAddedAiMessage, typingSpeedMs]);

  useEffect(() => {
    // If animation is forced to finish, stop animating and show final content
    if (forceFinishAnimation) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setIsAnimating(false);
    }
  }, [forceFinishAnimation]);

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
  
  const finalContent = renderTextWithMarkdown(message.text);

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
        <div className="text-sm whitespace-pre-wrap">
          {isAnimating && !forceFinishAnimation ? animatedText : finalContent}
        </div>
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
