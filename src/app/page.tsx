
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import ConversationLog from '@/components/chat/ConversationLog';
import MessageInput from '@/components/chat/MessageInput';
import { generateChatResponse, type GenerateChatResponseInput } from '@/ai/flows/generate-chat-response';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

// Mock knowledge base content
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
const API_KEYS_STORAGE_KEY = "aiBlairApiKeys";


export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string>(DEFAULT_AVATAR_SRC);
  const [personaTraits, setPersonaTraits] = useState<string>(DEFAULT_PERSONA_TRAITS);
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState<string | null>(null);
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const elevenLabsAudioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  const browserSpeak = useCallback((text: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel(); // This should trigger onend for the current utterance
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 1;
      utterance.rate = 1;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = (event) => {
        console.error("Browser Speech Synthesis error:", event);
        setIsSpeaking(false);
        toast({
          title: "Browser TTS Error",
          description: "An error occurred with browser speech synthesis.",
          variant: "destructive",
        });
      };
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn("Browser Speech Synthesis not supported or available.");
      toast({
        title: "TTS Not Supported",
        description: "Your browser does not support speech synthesis.",
        variant: "default",
      });
    }
  }, [toast, setIsSpeaking]);

  const speakText = useCallback(async (text: string) => {
    if (text.trim() === "") return;

    // Stop any currently playing ElevenLabs audio
    if (elevenLabsAudioRef.current) {
      elevenLabsAudioRef.current.pause();
      elevenLabsAudioRef.current.onplay = null;
      elevenLabsAudioRef.current.onended = null;
      elevenLabsAudioRef.current.onerror = null;
      if (elevenLabsAudioRef.current.src && elevenLabsAudioRef.current.src.startsWith('blob:')) {
         URL.revokeObjectURL(elevenLabsAudioRef.current.src);
      }
      elevenLabsAudioRef.current = null;
      setIsSpeaking(false);
    }
    // Stop any currently playing browser synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel(); // onend should handle setIsSpeaking(false)
    }


    if (elevenLabsApiKey && elevenLabsVoiceId) {
      const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`;
      const headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": elevenLabsApiKey,
      };
      const body = JSON.stringify({
        text: text,
        model_id: "eleven_multilingual_v2", // or your preferred model
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      });

      try {
        const response = await fetch(elevenLabsUrl, {
          method: "POST",
          headers: headers,
          body: body,
        });

        if (response.ok) {
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          elevenLabsAudioRef.current = audio;

          audio.onplay = () => setIsSpeaking(true);
          audio.onended = () => {
            setIsSpeaking(false);
            URL.revokeObjectURL(audioUrl);
            if (elevenLabsAudioRef.current === audio) {
               elevenLabsAudioRef.current = null;
            }
          };
          audio.onerror = (e) => {
            console.error("Error playing ElevenLabs audio:", e);
            setIsSpeaking(false);
            toast({
                title: "ElevenLabs Playback Error",
                description: "Could not play audio from ElevenLabs. Falling back to browser TTS.",
                variant: "destructive",
            });
            if (elevenLabsAudioRef.current === audio) {
               elevenLabsAudioRef.current = null;
            }
            browserSpeak(text); // Fallback
          };
          await audio.play();
          return;
        } else {
          let errorDetails = "Unknown error";
          let specificAdvice = "Check console for details.";
          try {
            const errorData = await response.json();
            errorDetails = errorData?.detail?.message || JSON.stringify(errorData);
            if (response.status === 401) {
              specificAdvice = "Your ElevenLabs API Key seems to be invalid or missing. Please check it in the Admin Panel.";
            } else if (response.status === 404 && errorData?.detail?.status === "voice_not_found") {
              specificAdvice = "The ElevenLabs Voice ID was not found. Please verify it in the Admin Panel.";
            } else if (errorData?.detail?.message) {
                specificAdvice = `ElevenLabs Error: ${errorData.detail.message}.`;
            }
          } catch (e) {
             try {
              errorDetails = await response.text();
              specificAdvice = `ElevenLabs returned status ${response.status}.`;
            } catch (textError) {
              errorDetails = `Status ${response.status} but could not parse error response.`;
            }
          }
          console.error("ElevenLabs API error:", response.status, errorDetails);
          toast({
            title: "ElevenLabs TTS Error",
            description: `${specificAdvice} Falling back to browser TTS.`,
            variant: "destructive",
            duration: 7000,
          });
        }
      } catch (error) {
        console.error("Error calling ElevenLabs API:", error);
        toast({
          title: "ElevenLabs Connection Error",
          description: "Could not connect to ElevenLabs. Falling back to browser TTS.",
          variant: "destructive",
        });
      }
    }
    // Fallback to browser speech synthesis
    browserSpeak(text);
  }, [elevenLabsApiKey, elevenLabsVoiceId, toast, browserSpeak, setIsSpeaking]);


  useEffect(() => {
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

    const storedApiKeys = localStorage.getItem(API_KEYS_STORAGE_KEY);
    if (storedApiKeys) {
      try {
        const keys = JSON.parse(storedApiKeys);
        setElevenLabsApiKey(keys.tts || null);
        setElevenLabsVoiceId(keys.voiceId || null);
      } catch (e) {
        console.error("Failed to parse API keys from local storage", e);
      }
    }
    
    const currentAudioRef = elevenLabsAudioRef.current;
    return () => {
      // Cleanup speech synthesis and audio on component unmount
      if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
       if (currentAudioRef) {
        currentAudioRef.pause();
        if (currentAudioRef.src && currentAudioRef.src.startsWith('blob:')) {
            URL.revokeObjectURL(currentAudioRef.src);
        }
      }
      setIsSpeaking(false);
    };
  }, [setIsSpeaking]); // setIsSpeaking is stable

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
      speakText(result.aiResponse);
    } catch (error) {
      console.error("Failed to get AI response:", error);
      const errorMessage = "Sorry, I encountered an error trying to respond. Please try again.";
      addMessage(errorMessage, 'ai');
      speakText(errorMessage); // Speak the error message too
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
    width: 120,
    height: 120,
    className: cn(
      "rounded-full border-4 border-primary shadow-md object-cover transition-transform duration-300",
      isSpeaking && "animate-pulse-speak"
    ),
    priority: true,
  };

  if (avatarSrc === DEFAULT_AVATAR_SRC || (avatarSrc && !avatarSrc.startsWith('data:image'))) {
     imageProps['data-ai-hint'] = "professional woman";
     if (!avatarSrc.startsWith('https://placehold.co')) {
        imageProps.src = DEFAULT_AVATAR_SRC; // Ensure placeholder is used if avatarSrc is invalid local item
     }
  }


  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
      <div className="md:col-span-1 flex flex-col items-center md:items-start space-y-4">
        <Card className="w-full shadow-xl">
          <CardContent className="pt-6 flex flex-col items-center">
            <Image {...imageProps} />
            <h2 className="mt-4 text-2xl font-bold text-center font-headline text-primary">AI Blair</h2>
             <p className="mt-2 text-center text-base font-semibold text-muted-foreground">
              Hello, I'm here to answer any questions you may have. What's on your mind?
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="md:col-span-2 flex flex-col h-full">
        <ConversationLog messages={messages} isLoadingAiResponse={isSendingMessage} />
        <MessageInput onSendMessage={handleSendMessage} isSending={isSendingMessage} />
      </div>
    </div>
  );
}
