'use client';

import type { Message } from '@/components/chat/ChatInterface';
import { cn } from "@/lib/utils";
import { User, Bot, Download, Thermometer } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import React, { useEffect, useState } from 'react';

// Helper function to parse basic markdown (**bold**) and newlines
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
}

export default function ChatBubble({
  message,
  avatarSrc,
}: ChatBubbleProps) {
  const isUser = message.sender === 'user';
  const DEFAULT_AVATAR_PLACEHOLDER = "https://placehold.co/40x40.png";
  const [formattedTime, setFormattedTime] = useState('');

  useEffect(() => {
    // This ensures the timestamp is only formatted on the client, after hydration,
    // preventing a mismatch between server and client rendered output.
    setFormattedTime(
      new Date(message.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  }, [message.timestamp]);

  const renderPdfLink = () => {
    if (message.sender === 'model' && message.pdfReference?.downloadURL) {
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
          {finalContent}
        </div>
        {renderPdfLink()}
        <div className="flex justify-between items-center mt-1">
            <p className={cn("text-xs", isUser ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {formattedTime}
            </p>
            {message.sender === 'model' && typeof message.distanceThreshold === 'number' && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground" title={`RAG Distance Threshold: ${message.distanceThreshold.toFixed(3)}`}>
                    <Thermometer className="h-3 w-3" />
                    <span>{message.distanceThreshold.toFixed(2)}</span>
                </div>
            )}
        </div>
      </div>
      {isUser && (
         <Avatar className="h-8 w-8 ml-2 self-start">
          <AvatarFallback><User size={20}/></AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
