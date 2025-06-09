
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

// Hoist SpeechRecognition API check to avoid re-checking in every render
const SpeechRecognitionAPI = (typeof window !== 'undefined') ? window.SpeechRecognition || (window as any).webkitSpeechRecognition : null;

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

  // Refs for callbacks to avoid stale closures in other effects/callbacks
  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);


  const addMessage = useCallback((text: string, sender: 'user' | 'ai') => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: Date.now().toString() + Math.random(), text, sender, timestamp: Date.now() },
    ]);
  }, [setMessages]);


  const toggleListening = useCallback((forceState?: boolean) => {
    if (!SpeechRecognitionAPI || !recognitionRef.current) {
      if (communicationMode === 'audio-only' || communicationMode === 'audio-text') {
        toast({ title: "Mic Not Supported", description: "Speech recognition is not initialized or not available in this browser.", variant: "destructive" });
      }
      setIsListening(false);
      return;
    }

    // If AI is speaking, only allow turning listening OFF.
    // Don't allow turning listening ON if AI is speaking.
    if (isSpeakingRef.current) {
        if (forceState === true || forceState === undefined) { // Trying to turn on or toggle
            toast({ title: "Please Wait", description: "AI Blair is currently speaking.", variant: "default" });
            return;
        }
        // If forceState is false, we allow it to proceed to turn off listening.
    }
    
    setIsListening(prevIsListening => {
      const targetState = typeof forceState === 'boolean' ? forceState : !prevIsListening;
      // In text-only mode, never allow listening to be true
      if (communicationMode === 'text-only' && targetState === true) {
        return false;
      }
      return targetState;
    });
  }, [communicationMode, toast, setIsListening]); // isSpeakingRef is used via .current

  const toggleListeningRef = useRef(toggleListening);
  useEffect(() => {
    toggleListeningRef.current = toggleListening;
  }, [toggleListening]);

  const handleAudioProcessStart = useCallback((text: string) => {
    currentAiResponseTextRef.current = text;
  }, []);

  const handleActualAudioStart = useCallback(() => {
    setIsSpeaking(true);
    if (currentAiResponseTextRef.current) {
      // Add message only if it hasn't been added (e.g. from text-only mode)
      // This might need adjustment if text-only also calls this path unexpectedly
      if (!messages.find(m => m.text === currentAiResponseTextRef.current && m.sender === 'ai')) {
          addMessage(currentAiResponseTextRef.current, 'ai');
      }
      currentAiResponseTextRef.current = null;
    }
    setIsSendingMessage(false); // AI is now speaking, so not "sending" in the sense of waiting for generation
  }, [addMessage, setIsSpeaking, setIsSendingMessage, messages]);


  const handleAudioProcessEnd = useCallback((audioPlayedSuccessfully: boolean) => {
    setIsSpeaking(false);

    if (!audioPlayedSuccessfully && currentAiResponseTextRef.current) {
      // If audio failed AND text wasn't added yet
       if (!messages.find(m => m.text === currentAiResponseTextRef.current && m.sender === 'ai')) {
            addMessage(currentAiResponseTextRef.current, 'ai');
       }
      currentAiResponseTextRef.current = null;
    } else if (currentAiResponseTextRef.current) {
      // This case ensures message is added if audio played but was not added in handleActualAudioStart
      // (e.g., if text-only mode or if browser TTS started and ended synchronously without onstart event)
       if (!messages.find(m => m.text === currentAiResponseTextRef.current && m.sender === 'ai')) {
            addMessage(currentAiResponseTextRef.current, 'ai');
       }
      currentAiResponseTextRef.current = null;
    }
    setIsSendingMessage(false); // Processing/speaking finished

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
          toggleListeningRef.current(true); // Always attempt to listen
      }, 1000);
    }
  }, [communicationMode, addMessage, setIsSpeaking, setIsSendingMessage, messages]);


  const browserSpeakInternal = useCallback((text: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (window.speechSynthesis.speaking) window.speechSynthesis.cancel(); // Cancel any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 1; utterance.rate = 1;
      utterance.onstart = handleActualAudioStart;
      utterance.onend = () => handleAudioProcessEnd(true);
      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        console.error("Browser Speech Synthesis error:", event.error);
        if (event.error !== 'interrupted') { // Don't toast for interruptions (e.g. mode switch)
          toast({ title: "Browser TTS Error", description: `Error: ${event.error || 'Unknown speech synthesis error'}.`, variant: "destructive" });
        }
        handleAudioProcessEnd(false);
      };
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn("Browser Speech Synthesis not supported.");
      toast({ title: "TTS Not Supported", description: "Browser does not support speech synthesis.", variant: "default" });
      handleAudioProcessEnd(false); // Treat as unsuccessful audio playback
    }
  }, [toast, handleActualAudioStart, handleAudioProcessEnd]);

  const speakText = useCallback(async (text: string) => {
    const processedText = text.replace(/EZCORP/gi, "E. Z. Corp");
    handleAudioProcessStart(processedText); // Let UI know we are about to process audio for this text

    if (communicationMode === 'text-only' || processedText.trim() === "") {
      if (currentAiResponseTextRef.current) { // Ensure message is added if not already
           if (!messages.find(m => m.text === currentAiResponseTextRef.current && m.sender === 'ai')) {
             addMessage(currentAiResponseTextRef.current, 'ai');
           }
           currentAiResponseTextRef.current = null;
      }
      setIsSendingMessage(false);
      setIsSpeaking(false); // Ensure speaking state is false for text-only
      return;
    }

    // Ensure any currently playing audio is stopped before starting new audio
    if (elevenLabsAudioRef.current && elevenLabsAudioRef.current.src && !elevenLabsAudioRef.current.ended && !elevenLabsAudioRef.current.paused) {
       elevenLabsAudioRef.current.pause();
       if (elevenLabsAudioRef.current.src.startsWith('blob:')) {
           URL.revokeObjectURL(elevenLabsAudioRef.current.src);
       }
       elevenLabsAudioRef.current.src = ''; // Clear src
       elevenLabsAudioRef.current = null; // Nullify the ref to allow a new one
    }
    if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel(); // Cancel browser TTS
    }
    // setIsSpeaking(true); // Set speaking true immediately - No, let onplay handle this

    if (elevenLabsApiKey && elevenLabsVoiceId) {
      const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`;
      const headers = {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsApiKey,
      };
      const body = JSON.stringify({
        text: processedText,
        model_id: 'eleven_multilingual_v2', // or your preferred model
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true }
      });

      try {
        const response = await fetch(elevenLabsUrl, { method: "POST", headers, body });
        if (response.ok) {
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl); // Create new audio object
          elevenLabsAudioRef.current = audio; // Assign to ref
          audio.onplay = handleActualAudioStart;
          audio.onended = () => handleAudioProcessEnd(true);
          audio.onerror = (e) => {
            console.error("Error playing ElevenLabs audio:", e);
            toast({ title: "ElevenLabs Playback Error", description: "Could not play audio. Falling back to browser TTS.", variant: "destructive" });
            browserSpeakInternal(processedText); // Fallback
          };
          await audio.play();
          return; // Success with ElevenLabs
        } else {
          // Handle ElevenLabs API errors (e.g., 401, 404, 422)
          let errorDetails = "Unknown error"; let specificAdvice = "Check console for details.";
          try {
            const errorData = await response.json(); errorDetails = errorData?.detail?.message || JSON.stringify(errorData);
            if (response.status === 401) specificAdvice = "Invalid ElevenLabs API Key.";
            else if (response.status === 404 && errorData?.detail?.status === "voice_not_found") specificAdvice = "ElevenLabs Voice ID not found.";
            else if (errorData?.detail?.message) specificAdvice = `ElevenLabs: ${errorData.detail.message}.`;
            else if (response.status === 422) { const messages = Array.isArray(errorData?.detail) ? errorData.detail.map((err: any) => err.msg).join(', ') : 'Invalid request.'; specificAdvice = `ElevenLabs (422): ${messages}.`;}
          } catch (e) { /* Failed to parse JSON error */ errorDetails = await response.text(); specificAdvice = `ElevenLabs API Error ${response.status}. Response: ${errorDetails.substring(0,100)}...`; }
          console.error("ElevenLabs API error:", response.status, errorDetails);
          toast({ title: "ElevenLabs TTS Error", description: `${specificAdvice} Falling back to browser TTS.`, variant: "destructive", duration: 7000 });
        }
      } catch (error) {
        console.error("Error calling ElevenLabs API:", error);
        toast({ title: "ElevenLabs Connection Error", description: "Could not connect to ElevenLabs. Falling back to browser TTS.", variant: "destructive" });
      }
    }
    // Fallback to browser TTS if ElevenLabs is not configured or fails
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
      handleAudioProcessStart,
      setIsSendingMessage,
      setIsSpeaking,
      messages
    ]);

  const speakTextRef = useRef(speakText);
  useEffect(() => { speakTextRef.current = speakText; }, [speakText]);

  const handleSendMessage = useCallback(async (text: string, method: 'text' | 'voice') => {
    if (text.trim() === '') return;
    addMessage(text, 'user');
    setIsSendingMessage(true);
    currentAiResponseTextRef.current = null; // Clear any pending AI response text

    const genkitChatHistory = messages
        .filter(msg => msg.text && msg.text.trim() !== "") // Filter out empty messages
        .map(msg => ({
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
      await speakTextRef.current(result.aiResponse); // Use ref to call latest speakText
    } catch (error) {
      console.error("Failed to get AI response:", error);
      const errorMessage = "Sorry, I encountered an error. Please try again.";
      await speakTextRef.current(errorMessage); // Use ref
    }
  }, [addMessage, messages, personaTraits, setIsSendingMessage]); // speakTextRef is stable

  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  const inputValueRef = useRef(inputValue);
  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  const initializeSpeechRecognition = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      if (communicationMode === 'audio-only' || communicationMode === 'audio-text') {
        toast({ title: "Mic Not Supported", description: "Speech recognition is not available in your browser.", variant: "destructive" });
      }
      return null;
    }
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false; // Stop after first pause
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
      setInputValue(finalTranscript || interimTranscript); // Update input field with speech
    };
    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted' && event.error !== 'network') {
        toast({ title: "Microphone Error", description: `Mic error: ${event.error}. Please check permissions.`, variant: "destructive" });
      }
      setIsListening(false);
    };
    recognition.onend = () => {
      // Note: isListening might already be false if stop() was called explicitly or due to error.
      // This onend primarily handles sending the message if there's a final transcript.
      const finalTranscript = inputValueRef.current; // Use ref for latest value
      setIsListening(false); // Ensure isListening is false
      if (finalTranscript && finalTranscript.trim()) {
        handleSendMessageRef.current(finalTranscript, 'voice');
      }
       setInputValue(''); // Clear input field after processing
    };
    return recognition;
  }, [toast, communicationMode, setIsListening, setInputValue]); // handleSendMessageRef, inputValueRef used via .current

  useEffect(() => {
    const rec = initializeSpeechRecognition();
    recognitionRef.current = rec;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current = null;
      }
    };
  }, [initializeSpeechRecognition]); // Re-initialize if the function identity changes (e.g. mode change)

  // Effect to control microphone start/stop based on isListening state
 useEffect(() => {
    const recInstance = recognitionRef.current;

    if (isListening) {
      if (!recInstance || communicationMode === 'text-only' || isSpeakingRef.current) {
        // If trying to listen but conditions are wrong, revert.
        setIsListening(false);
        if (isSpeakingRef.current && (communicationMode === 'audio-text' || communicationMode === 'audio-only')) {
            // toast({ title: "Please Wait", description: "AI Blair is speaking.", variant: "default" });
            // This toast is likely already handled by toggleListening, avoid double toast
        }
        return;
      }

      setInputValue(''); // Clear input before starting
      try {
        recInstance.start();
      } catch (error: any) {
        console.error('EFFECT: Error starting speech recognition:', error);
        if (error.name !== 'InvalidStateError') { // Ignore if already started
          toast({
            variant: 'destructive',
            title: 'Microphone Start Error',
            description: error.message || 'Could not start microphone. Check permissions.',
          });
          setIsListening(false); // Revert if start fails for other reasons
        }
      }
    } else { // When isListening is false
      if (recInstance) {
        try {
          // Check if recognition is active before stopping. Some browsers throw error.
          // However, stop() is generally idempotent on most modern implementations.
          recInstance.stop();
        } catch (e) {
          // console.warn("Attempted to stop speech recognition when not active or already stopped:", e);
        }
      }
    }
  }, [isListening, communicationMode, toast, setIsListening, setInputValue]); // isSpeakingRef is used


  const resetConversation = useCallback(() => {
    setMessages([]);
    setIsSendingMessage(false);
    setAiHasInitiatedConversation(false);
    setInputValue('');
    currentAiResponseTextRef.current = null;

    if (elevenLabsAudioRef.current) {
      if (elevenLabsAudioRef.current.src && !elevenLabsAudioRef.current.paused) {
        elevenLabsAudioRef.current.pause();
        if (elevenLabsAudioRef.current.src.startsWith('blob:')) {
            URL.revokeObjectURL(elevenLabsAudioRef.current.src);
        }
      }
      elevenLabsAudioRef.current.src = '';
      elevenLabsAudioRef.current.onplay = null;
      elevenLabsAudioRef.current.onended = null;
      elevenLabsAudioRef.current.onerror = null;
      elevenLabsAudioRef.current = null;
    }

    if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false); // This should be called AFTER cancelling, as cancel might trigger onend->handleAudioProcessEnd

    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    setIsListening(false);
  }, [setMessages, setIsSendingMessage, setAiHasInitiatedConversation, setInputValue, setIsSpeaking, setIsListening]);


  const handleChangeCommunicationMode = () => {
    resetConversation();
    setCommunicationMode(prevMode => {
      if (prevMode === 'audio-text') return 'text-only';
      if (prevMode === 'text-only') return 'audio-only';
      return 'audio-text'; // Default back to audio-text
    });
  };

  const modeButtonText = () => {
    if (communicationMode === 'audio-text') return "Switch to Text-Only";
    if (communicationMode === 'text-only') return "Switch to Audio-Only";
    return "Switch to Audio & Text";
  };

  useEffect(() => {
    if (communicationMode === 'audio-only' && !aiHasInitiatedConversation && personaTraits && messages.length === 0 && !isSpeakingRef.current) {
      setIsSendingMessage(true); // Indicate system is working
      setAiHasInitiatedConversation(true);
      const initGreeting = async () => {
        try {
          const result = await generateInitialGreeting({ personaTraits });
          await speakTextRef.current(result.greetingMessage);
          // speakText's onend handler (via handleAudioProcessEnd) will trigger listening
        } catch (error) {
          console.error("Failed to get initial AI greeting:", error);
          const errMsg = "Hello! I had a little trouble starting up. Please try changing modes or refreshing.";
          await speakTextRef.current(errMsg);
        } finally {
          // setIsSendingMessage(false); // Moved to handleActualAudioStart or handleAudioProcessEnd
        }
      };
      initGreeting();
    } else if (communicationMode !== 'audio-only' && isListening) {
        toggleListeningRef.current(false); // Stop listening if mode changes away from audio-only
    }
  }, [communicationMode, aiHasInitiatedConversation, personaTraits, messages.length, setIsSendingMessage]); // speakTextRef, isListening, toggleListeningRef are refs

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
      resetConversation(); // Full cleanup on unmount
    };
  }, [resetConversation]);


  const imageProps: React.ComponentProps<typeof Image> = {
    src: avatarSrc,
    alt: "AI Blair Avatar",
    width: communicationMode === 'audio-only' ? 200 : 120,
    height: communicationMode === 'audio-only' ? 200 : 120,
    className: cn(
      "rounded-full border-4 border-primary shadow-md object-cover transition-all duration-300",
      isSpeaking && "animate-pulse-speak" // isSpeaking directly used here
    ),
    priority: true,
  };
   if (avatarSrc === DEFAULT_AVATAR_SRC || (avatarSrc && !avatarSrc.startsWith('data:image') && !avatarSrc.startsWith('https://placehold.co'))) {
     imageProps['data-ai-hint'] = "professional woman";
     if (!avatarSrc.startsWith('https://placehold.co')) { // Ensure placeholder is used if local avatar fails or is invalid
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
          {/* Show Speak button if conversation initiated, not listening, not sending, and not speaking */}
          {aiHasInitiatedConversation && !isListening && !isSendingMessage && !isSpeaking && messages.length > 0 && (
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
            isSpeaking={isSpeaking} // Pass isSpeaking down
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

