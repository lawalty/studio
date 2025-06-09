
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ConversationLog from '@/components/chat/ConversationLog';
import MessageInput from '@/components/chat/MessageInput';
import { summarizeKnowledgeBase, type SummarizeKnowledgeBaseInput } from '@/ai/flows/summarize-knowledge-base';
import { generateChatResponse, type GenerateChatResponseInput } from '@/ai/flows/generate-chat-response';
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

const AVATAR_STORAGE_KEY = "aiBlairAvatar";
const DEFAULT_AVATAR_SRC = "https://placehold.co/300x300.png";
const PERSONA_STORAGE_KEY = "aiBlairPersona";
const DEFAULT_PERSONA_TRAITS = "You are AI Blair, a knowledgeable and helpful assistant specializing in the pawn store industry. You are professional, articulate, and provide clear, concise answers based on your knowledge base. Your tone is engaging and conversational.";


export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [knowledgeBaseSummary, setKnowledgeBaseSummary] = useState<string>("Loading knowledge base summary...");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [avatarSrc, setAvatarSrc] = useState<string>(DEFAULT_AVATAR_SRC);
  const [personaTraits, setPersonaTraits] = useState<string>(DEFAULT_PERSONA_TRAITS);
  const { toast } = useToast();

  const speakText = useCallback((text: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel(); // Cancel current speech before starting new one
      }
      const utterance = new SpeechSynthesisUtterance(text);
      // You could potentially set voice, pitch, rate here if needed
      // For example:
      // const voices = window.speechSynthesis.getVoices();
      // utterance.voice = voices.find(voice => voice.name === 'Your Preferred Voice Name'); // Example
      utterance.pitch = 1;
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn("Browser Speech Synthesis not supported or available.");
      toast({
        title: "TTS Not Supported",
        description: "Your browser does not support speech synthesis.",
        variant: "default",
      });
    }
  }, [toast]);

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

    const storedPersona = localStorage.getItem(PERSONA_STORAGE_KEY);
    if (storedPersona) {
      setPersonaTraits(storedPersona);
    } else {
      setPersonaTraits(DEFAULT_PERSONA_TRAITS);
    }
     // Clear any ongoing speech synthesis when the component unmounts or before a new summary is fetched
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    };
  }, [fetchSummary]);

  const addMessage = useCallback((text: string, sender: 'user' | 'ai') => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: Date.now().toString() + Math.random(), text, sender, timestamp: Date.now() },
    ]);
  }, []);

  const handleSendMessage = useCallback(async (text: string, method: 'text' | 'voice') => {
    addMessage(text, 'user');
    setIsSendingMessage(true);

    const genkitChatHistory = messages.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));

    try {
      const flowInput: GenerateChatResponseInput = {
        userMessage: text,
        knowledgeBaseContent: MOCK_KNOWLEDGE_BASE_CONTENT,
        personaTraits: personaTraits,
        chatHistory: genkitChatHistory,
      };
      const result = await generateChatResponse(flowInput);
      addMessage(result.aiResponse, 'ai');
      speakText(result.aiResponse); // Speak the AI's response
    } catch (error) {
      console.error("Failed to get AI response:", error);
      const errorMessage = "Sorry, I encountered an error trying to respond. Please try again.";
      addMessage(errorMessage, 'ai');
      speakText(errorMessage); // Speak the error message
      toast({
        title: "AI Error",
        description: "Could not get a response from AI Blair. Please check the console for details.",
        variant: "destructive",
      });
    } finally {
      setIsSendingMessage(false);
    }
  }, [addMessage, messages, personaTraits, toast, speakText]);

  const imageProps: React.ComponentProps<typeof Image> = {
    src: avatarSrc,
    alt: "AI Blair Avatar",
    width: 200,
    height: 200,
    className: "rounded-full border-4 border-primary shadow-md object-cover",
    priority: true,
  };

  if (avatarSrc === DEFAULT_AVATAR_SRC || (avatarSrc && !avatarSrc.startsWith('data:image'))) {
     imageProps['data-ai-hint'] = "professional woman";
     if (!avatarSrc.startsWith('https://placehold.co')) {
        imageProps.src = DEFAULT_AVATAR_SRC;
     }
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
