
'use client';

import type { Message } from '@/components/chat/ChatInterface';
import { cn } from "@/lib/utils";
import { User, Bot, Download, Thermometer, FileText } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const renderTextWithMarkdown = (text: string): JSX.Element => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({node, ...props}) => <table className="w-full text-left border-collapse my-2" {...props} />,
        thead: ({node, ...props}) => <thead className="bg-muted/50" {...props} />,
        tbody: ({node, ...props}) => <tbody {...props} />,
        tr: ({node, ...props}) => <tr className="border-b border-muted last:border-b-0" {...props} />,
        th: ({node, ...props}) => <th className="p-2 font-semibold" {...props} />,
        td: ({node, ...props}) => <td className="p-2 align-top" {...props} />,
        p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
        strong: ({node, ...props}) => <strong className="font-bold" {...props} />,
        ol: ({node, ...props}) => <ol className="list-decimal list-inside ml-2 space-y-1" {...props} />,
        ul: ({node, ...props}) => <ul className="list-disc list-inside ml-2 space-y-1" {...props} />,
        li: ({node, ...props}) => <li className="pl-1" {...props} />,
      }}
    >
      {text}
    </ReactMarkdown>
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
    // Only render the download link if the URL is present and valid.
    if (message.sender === 'model' && message.pdfReference?.downloadURL && message.pdfReference?.fileName) {
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
  
  const renderDiagnostics = () => {
    if (message.sender === 'user') return null;

    const fileToDisplay = message.pdfReference?.fileName || message.debugClosestMatch?.fileName;
    
    // Do not render diagnostics if distance is not present, unless there's a debug match to show.
    if (message.distance === undefined && !fileToDisplay) return null;

    return (
      <div className="mt-2 text-xs text-muted-foreground/80 space-y-1 border-t border-muted-foreground/20 pt-1">
        {fileToDisplay && (
           <div className="flex items-center gap-1.5" title="Top matched document from knowledge base">
               <FileText className="h-3 w-3" />
               <span className="truncate">{fileToDisplay}</span>
           </div>
        )}
        {typeof message.distance === 'number' && (
          <div className="flex items-center gap-1.5" title={`Match Distance / Threshold`}>
              <Thermometer className="h-3 w-3" />
              <span>{message.distance.toFixed(3)} / {message.distanceThreshold?.toFixed(2)}</span>
          </div>
        )}
      </div>
    );
  };

  const finalContent = renderTextWithMarkdown(message.text);

  return (
    <div className={cn("flex w-full mb-4 items-end animate-in fade-in duration-300", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("flex items-end gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
        {!isUser && (
          <Avatar className="h-8 w-8 self-start">
            {avatarSrc && !avatarSrc.startsWith('https://placehold.co') ? (
               <AvatarImage src={avatarSrc} alt="AI Avatar" className="object-cover"/>
            ) : (
               <AvatarImage src={DEFAULT_AVATAR_PLACEHOLDER} alt="AI Avatar Placeholder" data-ai-hint="professional woman" />
            )}
            <AvatarFallback><Bot size={20}/></AvatarFallback>
          </Avatar>
        )}
        {isUser && (
           <Avatar className="h-8 w-8 self-start">
            <AvatarFallback><User size={20}/></AvatarFallback>
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
          <div className={cn("flex items-center mt-1", isUser ? "justify-end" : "justify-start")}>
              <p className={cn("text-xs", isUser ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {formattedTime}
              </p>
          </div>
          {renderDiagnostics()}
        </div>
      </div>
    </div>
  );
}
