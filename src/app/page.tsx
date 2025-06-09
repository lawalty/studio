
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ConversationLog from '@/components/chat/ConversationLog';
import MessageInput from '@/components/chat/MessageInput';
import { summarizeKnowledgeBase, type SummarizeKnowledgeBaseInput } from '@/ai/flows/summarize-knowledge-base';
import { useToast } from "@/hooks/use-toast";

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

// Mock knowledge base content for summarization
const MOCK_KNOWLEDGE_BASE_CONTENT = `
Pawn Store Operations Handbook:
This document covers daily operations, security procedures, and customer service best practices for pawn stores.
Key sections include inventory management, loan processing, and compliance with local and federal regulations.

Jewelry Appraisal Guide:
A comprehensive guide to appraising various types of jewelry, including diamonds, gold, silver, and gemstones.
Includes information on identifying hallmarks, assessing quality, and determining market value.

Pawn Loan Regulations Overview:
Details on legal requirements for pawn loans, including interest rates, holding periods, and customer identification.
Covers state-specific regulations and federal laws like the Truth in Lending Act.

Antique Collectibles Pricing:
Information on valuing antique items, collectibles, and memorabilia commonly found in pawn stores.
Focuses on rarity, condition, and provenance as key factors in pricing.
`;

const AVATAR_STORAGE_KEY = "aiBlairAvatar"; // Same key as used in admin/persona page
const DEFAULT_AVATAR_SRC = "https://placehold.co/300x300.png";


export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [knowledgeBaseSummary, setKnowledgeBaseSummary] = useState<string>("Loading knowledge base summary...");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [avatarSrc, setAvatarSrc] = useState<string>(DEFAULT_AVATAR_SRC);
  const { toast } = useToast();

  const fetchSummary = useCallback(async () => {
    setIsLoadingSummary(true);
    try {
      const input: SummarizeKnowledgeBaseInput = { knowledgeBaseContent: MOCK_KNOWLEDGE_BASE_CONTENT };
      const result = await summarizeKnowledgeBase(input);
      setKnowledgeBaseSummary(result.summary);
    } catch (error) {
      console.error("Failed to fetch summary:", error);
      setKnowledgeBaseSummary("AI Blair is ready to discuss pawn store operations, inventory management, and customer relations. Ask anything about the pawn business!");
      toast({
        title: "Error",
        description: "Could not load knowledge base summary. Using default.",
        variant: "destructive",
      });
    }
    setIsLoadingSummary(false);
  }, [toast]);

  useEffect(() => {
    fetchSummary();

    const storedAvatar = localStorage.getItem(AVATAR_STORAGE_KEY);
    if (storedAvatar) {
      setAvatarSrc(storedAvatar);
    } else {
      setAvatarSrc(DEFAULT_AVATAR_SRC);
    }
  }, [fetchSummary]);

  const addMessage = (text: string, sender: 'user' | 'ai') => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: Date.now().toString() + Math.random(), text, sender, timestamp: Date.now() },
    ]);
  };

  const handleSendMessage = async (text: string, method: 'text' | 'voice') => {
    addMessage(text, 'user');
    setIsSendingMessage(true);

    // Simulate AI response
    // In a real app, this would call the AI backend with 'text' and 'method'
    // For example, if method is 'voice', it might trigger STT then NLP then TTS.
    // Here, we'll just echo or give a canned response.
    setTimeout(() => {
      let aiResponse = `AI Blair received your ${method} message: "${text}"`;
      if (text.toLowerCase().includes('hello') || text.toLowerCase().includes('hi')) {
        aiResponse = "Hello there! How can I help you with your pawn store questions today?";
      } else if (text.toLowerCase().includes('pawn')) {
        aiResponse = "Pawn stores offer a fascinating look into collateralized loans and unique items! What specifically interests you?";
      } else if (text.toLowerCase().includes('price') || text.toLowerCase().includes('value')) {
        aiResponse = "Valuation is key in the pawn business. Are you asking about a specific item type or the general process?";
      }
      addMessage(aiResponse, 'ai');
      setIsSendingMessage(false);
      // Simulate TTS audio playback starting here
    }, 1500 + Math.random() * 1000);
  };
  
  const imageProps: React.ComponentProps<typeof Image> = {
    src: avatarSrc,
    alt: "AI Blair Avatar",
    width: 200,
    height: 200,
    className: "rounded-full border-4 border-primary shadow-md object-cover", // Added object-cover
    priority: true,
  };

  if (avatarSrc === DEFAULT_AVATAR_SRC) {
    imageProps['data-ai-hint'] = "professional woman";
  }


  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
      {/* Left Column: Avatar and Summary */}
      <div className="md:col-span-1 flex flex-col items-center md:items-start space-y-4">
        <Card className="w-full shadow-xl">
          <CardContent className="pt-6 flex flex-col items-center">
            <Image {...imageProps} />
            <h2 className="mt-4 text-3xl font-bold text-center font-headline text-primary">AI Blair</h2>
          </CardContent>
        </Card>
        <Card className="w-full shadow-xl">
          <CardHeader>
            <CardTitle className="font-headline">Knowledge Base Focus</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded w-3/4 animate-pulse"></div>
                <div className="h-4 bg-muted rounded w-full animate-pulse"></div>
                <div className="h-4 bg-muted rounded w-1/2 animate-pulse"></div>
              </div>
            ) : (
              <CardDescription className="text-sm text-foreground">
                {knowledgeBaseSummary}
              </CardDescription>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Conversation Log and Input */}
      <div className="md:col-span-2 flex flex-col h-full">
        <ConversationLog messages={messages} isLoadingAiResponse={isSendingMessage} />
        <MessageInput onSendMessage={handleSendMessage} isSending={isSendingMessage} />
      </div>
    </div>
  );
}
