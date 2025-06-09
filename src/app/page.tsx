
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ConversationLog from '@/components/chat/ConversationLog';
import MessageInput from '@/components/chat/MessageInput';
import { generateChatResponse, type GenerateChatResponseInput } from '@/ai/flows/generate-chat-response';
import { generateInitialGreeting } from '@/ai/flows/generate-initial-greeting';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { RotateCcw, Mic, Square as SquareIcon } from 'lucide-react';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

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

type CommunicationMode = 'audio-text' | 'text-only' | 'audio-only';

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string>(DEFAULT_AVATAR_SRC);
  const [personaTraits, setPersonaTraits] = useState<string>(DEFAULT_PERSONA_TRAITS);
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState<string | null>(null);
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [communicationMode, setCommunicationMode] = useState<CommunicationMode>('audio-text');
  const [aiHasInitiatedConversation, setAiHasInitiatedConversation] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const elevenLabsAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAiResponseTextRef = useRef<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();

  const addMessage = useCallback((text: string, sender: 'user' | 'ai') => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: Date.now().toString() + Math.random(), text, sender, timestamp: Date.now() },
    ]);
  }, [setMessages]);

  const handleAudioProcessStart = useCallback((text: string) => {
    currentAiResponseTextRef.current = text;
  }, []);

  const handleActualAudioStart = useCallback(() => {
    setIsSpeaking(true);
    if (currentAiResponseTextRef.current) {
      addMessage(currentAiResponseTextRef.current, 'ai');
      currentAiResponseTextRef.current = null;
    }
    setIsSendingMessage(false);
  }, [addMessage, setIsSpeaking, setIsSendingMessage, currentAiResponseTextRef]);

  const toggleListening = useCallback((forceState?: boolean) => {
    if (typeof window === 'undefined' || !recognitionRef.current) {
      if (communicationMode === 'audio-only' || communicationMode === 'audio-text') {
        toast({ title: "Mic Not Supported", description: "Speech recognition is not initialized.", variant: "destructive" });
      }
      setIsListening(false);
      return;
    }

    if (isSpeaking && (forceState === undefined || forceState === true)) {
        toast({ title: "Please Wait", description: "AI Blair is currently speaking.", variant: "default" });
        return;
    }

    setIsListening(prev => {
      const targetState = typeof forceState === 'boolean' ? forceState : !prev;
      return targetState;
    });
  }, [communicationMode, toast, setIsListening, isSpeaking, recognitionRef]);

  const toggleListeningRef = useRef(toggleListening);
  useEffect(() => {
    toggleListeningRef.current = toggleListening;
  }, [toggleListening]);

  const handleAudioProcessEnd = useCallback((audioPlayedSuccessfully: boolean) => {
    setIsSpeaking(false);

    if (!audioPlayedSuccessfully && currentAiResponseTextRef.current) {
      addMessage(currentAiResponseTextRef.current, 'ai');
      currentAiResponseTextRef.current = null;
    } else if (currentAiResponseTextRef.current) {
      addMessage(currentAiResponseTextRef.current, 'ai');
      currentAiResponseTextRef.current = null;
    }
    setIsSendingMessage(false);

    if (elevenLabsAudioRef.current) {
      if (elevenLabsAudioRef.current.src && elevenLabsAudioRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(elevenLabsAudioRef.current.src);
      }
      elevenLabsAudioRef.current.onplay = null;
      elevenLabsAudioRef.current.onended = null;
      elevenLabsAudioRef.current.onerror = null;
      elevenLabsAudioRef.current = null;
    }

    if (communicationMode === 'audio-only') {
      setTimeout(() => {
          toggleListeningRef.current(true);
      }, 1000);
    }
  }, [
    addMessage,
    communicationMode,
    setIsSpeaking,
    setIsSendingMessage,
    currentAiResponseTextRef,
    elevenLabsAudioRef,
  ]);

  const browserSpeakInternal = useCallback((text: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 1; utterance.rate = 1;
      utterance.onstart = handleActualAudioStart;
      utterance.onend = () => handleAudioProcessEnd(true);
      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        console.error("Browser Speech Synthesis error:", event.error);
        toast({ title: "Browser TTS Error", description: `Error: ${event.error}`, variant: "destructive" });
        handleAudioProcessEnd(false);
      };
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn("Browser Speech Synthesis not supported.");
      toast({ title: "TTS Not Supported", description: "Browser does not support speech synthesis.", variant: "default" });
      handleAudioProcessEnd(false);
    }
  }, [toast, handleActualAudioStart, handleAudioProcessEnd]);

  const speakText = useCallback(async (text: string) => {
    const processedText = text.replace(/EZCORP/gi, "E. Z. Corp");
    handleAudioProcessStart(processedText);

    if (communicationMode === 'text-only' || processedText.trim() === "") {
      if (currentAiResponseTextRef.current) {
          addMessage(currentAiResponseTextRef.current, 'ai');
          currentAiResponseTextRef.current = null;
      }
      setIsSendingMessage(false);
      setIsSpeaking(false);
      return;
    }

    if (elevenLabsAudioRef.current && elevenLabsAudioRef.current.src && !elevenLabsAudioRef.current.ended && !elevenLabsAudioRef.current.paused) {
       elevenLabsAudioRef.current.pause();
       if (elevenLabsAudioRef.current.src.startsWith('blob:')) {
           URL.revokeObjectURL(elevenLabsAudioRef.current.src);
       }
       elevenLabsAudioRef.current.src = '';
       elevenLabsAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

    if (elevenLabsApiKey && elevenLabsVoiceId) {
      const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`;
      const headers = {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsApiKey,
      };
      const body = JSON.stringify({
        text: processedText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true }
      });

      try {
        const response = await fetch(elevenLabsUrl, { method: "POST", headers, body });
        if (response.ok) {
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          elevenLabsAudioRef.current = audio;
          audio.onplay = handleActualAudioStart;
          audio.onended = () => handleAudioProcessEnd(true);
          audio.onerror = (e) => {
            console.error("Error playing ElevenLabs audio:", e);
            toast({ title: "ElevenLabs Playback Error", description: "Could not play. Falling back to browser TTS.", variant: "destructive" });
            browserSpeakInternal(processedText);
          };
          await audio.play();
          return;
        } else {
          let errorDetails = "Unknown error"; let specificAdvice = "Check console.";
          try {
            const errorData = await response.json(); errorDetails = errorData?.detail?.message || JSON.stringify(errorData);
            if (response.status === 401) specificAdvice = "ElevenLabs API Key invalid.";
            else if (response.status === 404 && errorData?.detail?.status === "voice_not_found") specificAdvice = "ElevenLabs Voice ID not found.";
            else if (errorData?.detail?.message) specificAdvice = `ElevenLabs: ${errorData.detail.message}.`;
            else if (response.status === 422) { const messages = Array.isArray(errorData?.detail) ? errorData.detail.map((err: any) => err.msg).join(', ') : 'Invalid request.'; specificAdvice = `ElevenLabs (422): ${messages}.`;}
          } catch (e) { errorDetails = await response.text(); specificAdvice = `ElevenLabs API Error ${response.status}. Response: ${errorDetails.substring(0,100)}...`; }
          console.error("ElevenLabs API error:", response.status, errorDetails);
          toast({ title: "ElevenLabs TTS Error", description: `${specificAdvice} Falling back.`, variant: "destructive", duration: 7000 });
        }
      } catch (error) {
        console.error("Error calling ElevenLabs API:", error);
        toast({ title: "ElevenLabs Connection Error", description: "Could not connect. Falling back to browser TTS.", variant: "destructive" });
      }
    }
    browserSpeakInternal(processedText);
  }, [
      elevenLabsApiKey,
      elevenLabsVoiceId,
      toast,
      handleActualAudioStart,
      handleAudioProcessEnd,
      communicationMode,
      addMessage,
      browserSpeakInternal,
      currentAiResponseTextRef,
      elevenLabsAudioRef,
      setIsSendingMessage,
      handleAudioProcessStart,
      setIsSpeaking
    ]);

  const handleSendMessage = useCallback(async (text: string, method: 'text' | 'voice') => {
    if (text.trim() === '') return;
    addMessage(text, 'user');
    setIsSendingMessage(true);
    currentAiResponseTextRef.current = null;

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
      await speakText(result.aiResponse);
    } catch (error) {
      console.error("Failed to get AI response:", error);
      const errorMessage = "Sorry, I encountered an error. Please try again.";
      await speakText(errorMessage);
    }
  }, [addMessage, messages, personaTraits, speakText, setIsSendingMessage, currentAiResponseTextRef]);

  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  const inputValueRef = useRef(inputValue);
  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  const initializeSpeechRecognition = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      if (communicationMode === 'audio-only' || communicationMode === 'audio-text') {
        toast({ title: "Mic Not Supported", description: "Speech recognition is not available in your browser.", variant: "destructive" });
      }
      return null;
    }
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setInputValue(finalTranscript || interimTranscript);
    };
    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      toast({ title: "Microphone Error", description: `Mic error: ${event.error}. Access allowed?`, variant: "destructive" });
      setIsListening(false);
    };
    recognition.onend = () => {
      const finalTranscript = inputValueRef.current;
      setIsListening(false);
      if (finalTranscript && finalTranscript.trim()) {
        handleSendMessageRef.current(finalTranscript, 'voice');
      }
       setInputValue('');
    };
    return recognition;
  }, [toast, communicationMode, setInputValue, setIsListening, handleSendMessageRef, inputValueRef]);

  useEffect(() => {
    const rec = initializeSpeechRecognition();
    recognitionRef.current = rec;
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [initializeSpeechRecognition]);

  useEffect(() => {
    if (typeof window === 'undefined' || !recognitionRef.current) {
      if (isListening && (communicationMode === 'audio-only' || communicationMode === 'audio-text')) {
         toast({ title: "Mic Not Ready", description: "Speech recognition could not be initialized.", variant: "destructive" });
         setIsListening(false);
      }
      return;
    }

    if (isListening) {
      setInputValue('');
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error('Error starting speech recognition from effect:', error);
        toast({
          variant: 'destructive',
          title: 'Microphone Error',
          description: 'Could not start microphone. Please check permissions.',
        });
        setIsListening(false);
      }
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }
  }, [isListening, toast, setInputValue, setIsListening, communicationMode]);


  const resetConversation = useCallback(() => {
    setMessages([]);
    setIsSendingMessage(false);
    setAiHasInitiatedConversation(false);
    setInputValue('');
    currentAiResponseTextRef.current = null;
    if (elevenLabsAudioRef.current && elevenLabsAudioRef.current.src && !elevenLabsAudioRef.current.paused) {
       elevenLabsAudioRef.current.pause();
       if (elevenLabsAudioRef.current.src.startsWith('blob:')) {
           URL.revokeObjectURL(elevenLabsAudioRef.current.src);
       }
       elevenLabsAudioRef.current.src = '';
       elevenLabsAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
     if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, [setMessages, setIsSendingMessage, setAiHasInitiatedConversation, setIsListening, setInputValue]);


  const handleChangeCommunicationMode = () => {
    resetConversation();
    setCommunicationMode(prevMode => {
      if (prevMode === 'audio-text') return 'text-only';
      if (prevMode === 'text-only') return 'audio-only';
      return 'audio-text';
    });
  };

  const modeButtonText = () => {
    if (communicationMode === 'audio-text') return "Switch to Text-Only";
    if (communicationMode === 'text-only') return "Switch to Audio-Only";
    return "Switch to Audio & Text";
  };

  useEffect(() => {
    if (communicationMode === 'audio-only' && !aiHasInitiatedConversation && personaTraits && messages.length === 0) {
      setIsSendingMessage(true);
      setAiHasInitiatedConversation(true);
      const initGreeting = async () => {
        try {
          const result = await generateInitialGreeting({ personaTraits });
          await speakText(result.greetingMessage);
        } catch (error) {
          console.error("Failed to get initial AI greeting:", error);
          const errMsg = "Hello! I had a little trouble starting up. Please try changing modes or refreshing.";
          await speakText(errMsg);
        }
      };
      initGreeting();
    } else if (communicationMode !== 'audio-only' && isListening) {
        toggleListeningRef.current(false);
    }
  }, [communicationMode, aiHasInitiatedConversation, personaTraits, speakText, setIsSendingMessage, setAiHasInitiatedConversation, isListening, messages.length]);

  useEffect(() => {
    const storedAvatar = localStorage.getItem(AVATAR_STORAGE_KEY);
    setAvatarSrc(storedAvatar || DEFAULT_AVATAR_SRC);
    const storedPersona = localStorage.getItem(PERSONA_STORAGE_KEY);
    setPersonaTraits(storedPersona || DEFAULT_PERSONA_TRAITS);
    const storedApiKeys = localStorage.getItem(API_KEYS_STORAGE_KEY);
    if (storedApiKeys) {
      try {
        const keys = JSON.parse(storedApiKeys);
        setElevenLabsApiKey(keys.tts || null);
        setElevenLabsVoiceId(keys.voiceId || null);
      } catch (e) { console.error("Failed to parse API keys", e); }
    }

    return () => {
      resetConversation();
    };
  }, [resetConversation]);


  const imageProps: React.ComponentProps<typeof Image> = {
    src: avatarSrc,
    alt: "AI Blair Avatar",
    width: communicationMode === 'audio-only' ? 200 : 120,
    height: communicationMode === 'audio-only' ? 200 : 120,
    className: cn(
      "rounded-full border-4 border-primary shadow-md object-cover transition-all duration-300",
      isSpeaking && "animate-pulse-speak"
    ),
    priority: true,
  };
   if (avatarSrc === DEFAULT_AVATAR_SRC || (avatarSrc && !avatarSrc.startsWith('data:image') && !avatarSrc.startsWith('https://placehold.co'))) {
     imageProps['data-ai-hint'] = "professional woman";
     if (!avatarSrc.startsWith('https://placehold.co')) {
        imageProps.src = DEFAULT_AVATAR_SRC;
     }
  }

  const mainContent = () => {
    if (communicationMode === 'audio-only') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center py-8">
          <Image {...imageProps} />
          <h2 className="mt-6 text-3xl font-bold font-headline text-primary">AI Blair</h2>
          {messages.length > 0 && (
            <div className="w-full max-w-md mt-6">
                 <ConversationLog messages={messages} isLoadingAiResponse={isSendingMessage} avatarSrc={avatarSrc} />
            </div>
          )}
          {isListening && (
             <div className="mt-4 flex items-center justify-center p-3 rounded-lg bg-secondary text-secondary-foreground shadow animate-pulse">
                <Mic size={20} className="mr-2"/> Listening...
            </div>
          )}
          {aiHasInitiatedConversation && !isListening && messages.length > 0 && !isSendingMessage && (
             <Button onClick={() => toggleListeningRef.current(true)} variant="outline" size="lg" className="mt-6">
                <Mic size={24} className="mr-2"/> Speak
            </Button>
          )}
           {!aiHasInitiatedConversation && isSendingMessage && messages.length === 0 && (
             <div className="mt-4 flex items-center justify-center p-3 rounded-lg bg-secondary text-secondary-foreground shadow animate-pulse">
                Preparing greeting...
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
        <div className="md:col-span-1 flex flex-col items-center md:items-start space-y-4">
          <Card className="w-full shadow-xl">
            <CardContent className="pt-6 flex flex-col items-center">
              <Image {...imageProps} />
              <h2 className="mt-4 text-2xl font-bold text-center font-headline text-primary">AI Blair</h2>
              <p className="mt-2 text-center text-base font-semibold text-muted-foreground">
                {communicationMode === 'audio-text' && "Hello! How can I help you today?"}
                {communicationMode === 'text-only' && "Hello! Please type your questions below."}
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="md:col-span-2 flex flex-col h-full">
          <ConversationLog messages={messages} isLoadingAiResponse={isSendingMessage} avatarSrc={avatarSrc} />
          <MessageInput
            onSendMessage={handleSendMessageRef.current}
            isSending={isSendingMessage}
            showMicButton={communicationMode === 'audio-text'}
            isListening={isListening}
            onToggleListening={() => toggleListeningRef.current()}
            inputValue={inputValue}
            onInputValueChange={setInputValue}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow">
        {mainContent()}
      </div>
      <div className="py-4 text-center border-t mt-auto">
        <Button onClick={handleChangeCommunicationMode} variant="outline">
          <RotateCcw size={16} className="mr-2" /> {modeButtonText()}
        </Button>
      </div>
    </div>
  );
}

