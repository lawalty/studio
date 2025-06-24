
import type { Message } from '@/app/page';
import { cn } from "@/lib/utils";
import { User, Bot, Download } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import React, { useEffect, useRef, useState } from 'react';

interface ChatBubbleProps {
  message: Message;
  avatarSrc: string;
  textAnimationEnabled: boolean;
  textAnimationSpeedMs: number;
  textPopulationStaggerMs: number;
  isNewlyAddedAiMessage: boolean;
  forceFinishAnimation: boolean;
}

export default function ChatBubble({
  message,
  avatarSrc,
  textAnimationEnabled,
  textAnimationSpeedMs,
  textPopulationStaggerMs,
  isNewlyAddedAiMessage,
  forceFinishAnimation
}: ChatBubbleProps) {
  const isUser = message.sender === 'user';
  const DEFAULT_AVATAR_PLACEHOLDER = "https://placehold.co/40x40.png";
  const textContentRef = useRef<HTMLParagraphElement>(null);
  const [hasAnimationBeenForced, setHasAnimationBeenForced] = useState(false);

  useEffect(() => {
    setHasAnimationBeenForced(false);
  }, [message.id]);

  useEffect(() => {
    if (forceFinishAnimation && message.sender === 'ai' && !hasAnimationBeenForced) {
      if (textContentRef.current) {
        const letterSpans = textContentRef.current.querySelectorAll('.scale-in-letter');
        letterSpans.forEach(span => {
          (span as HTMLElement).style.opacity = '1';
          (span as HTMLElement).style.transform = 'scale(1) translateX(0)';
          (span as HTMLElement).style.animation = 'none';
        });
      }
      setHasAnimationBeenForced(true);
    }
  }, [forceFinishAnimation, message.id, message.sender, hasAnimationBeenForced]);


  const renderTextContent = () => {
    const processedText = message.text.replace(/\*\*/g, '\n\n');

    if (hasAnimationBeenForced) {
      return processedText;
    }

    if (message.sender === 'ai' && textAnimationEnabled && isNewlyAddedAiMessage) {
      const letters = processedText.split('');
      const animationDuration = textAnimationSpeedMs > 0 ? textAnimationSpeedMs : 800;
      const staggerDelay = textPopulationStaggerMs > 0 ? textPopulationStaggerMs : 50;

      return letters.map((letter, index) => (
        <span
          key={`${message.id}-letter-${index}`}
          className="scale-in-letter"
          style={{
            animationDuration: `${animationDuration}ms`,
            animationDelay: `${index * staggerDelay}ms`,
          }}
        >
          {letter === ' ' ? '\u00A0' : letter}
        </span>
      ));
    }
    return processedText;
  };
  
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
        <p ref={textContentRef} className="text-sm whitespace-pre-wrap">{renderTextContent()}</p>
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
