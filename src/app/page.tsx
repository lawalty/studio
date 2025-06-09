
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

  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  const communicationModeRef = useRef(communicationMode);
  useEffect(() => { communicationModeRef.current = communicationMode; }, [communicationMode]);

  const addMessage = useCallback((text: string, sender: 'user' | 'ai') => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: Date.now().toString() + Math.random(), text, sender, timestamp: Date.now() },
    ]);
  }, []);


  const toggleListening = useCallback((forceState?: boolean) => {
    const targetState = typeof forceState === 'boolean' ? forceState : !isListening;

    if (targetState === true) { // Trying to turn ON
      if (!recognitionRef.current) {
        if (communicationModeRef.current === 'audio-only' || communicationModeRef.current === 'audio-text') {
          toast({ title: "Mic Not Supported", description: "Speech recognition is not initialized.", variant: "destructive" });
        }
        setIsListening(false);
        return;
      }
      if (isSpeakingRef.current) {
        toast({ title: "Please Wait", description: "AI Blair is currently speaking.", variant: "default" });
        setIsListening(false);
        return;
      }
      if (communicationModeRef.current === 'text-only') {
         setIsListening(false);
         return;
      }
    }
    setIsListening(targetState);
  }, [isListening, toast]);

  const toggleListeningRef = useRef(toggleListening);
  useEffect(() => { toggleListeningRef.current = toggleListening; }, [toggleListening]);


  const handleAudioProcessStart = useCallback((text: string) => {
    currentAiResponseTextRef.current = text;
    // isSpeaking will be set true by the audio onplay events
  }, []);

  const handleActualAudioStart = useCallback(() => {
    setIsSpeaking(true);
    if (currentAiResponseTextRef.current) {
      if (!messages.find(m => m.text === currentAiResponseTextRef.current && m.sender === 'ai')) {
          addMessage(currentAiResponseTextRef.current, 'ai');
      }
      // Do not nullify currentAiResponseTextRef.current here, handleAudioProcessEnd needs it if audio fails to play
    }
    setIsSendingMessage(false); // AI has started responding, so not "sending" in the sense of waiting for LLM
  }, [addMessage, messages]);


  const handleAudioProcessEnd = useCallback((audioPlayedSuccessfully: boolean) => {
    setIsSpeaking(false);

    if (!audioPlayedSuccessfully && currentAiResponseTextRef.current) {
       if (!messages.find(m => m.text === currentAiResponseTextRef.current && m.sender === 'ai')) {
            addMessage(currentAiResponseTextRef.current, 'ai');
       }
    } else if (audioPlayedSuccessfully && currentAiResponseTextRef.current) {
       // Message should have been added by handleActualAudioStart or already present
       // This ensures it's added if onplay didn't fire for some reason (e.g. very short audio)
        if (!messages.find(m => m.text === currentAiResponseTextRef.current && m.sender === 'ai')) {
            addMessage(currentAiResponseTextRef.current, 'ai');
        }
    }
    currentAiResponseTextRef.current = null; // Clear after processing
    setIsSendingMessage(false); // Ensure sending state is cleared

    if (elevenLabsAudioRef.current) {
      if (elevenLabsAudioRef.current.src && elevenLabsAudioRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(elevenLabsAudioRef.current.src);
      }
      elevenLabsAudioRef.current.onplay = null;
      elevenLabsAudioRef.current.onended = null;
      elevenLabsAudioRef.current.onerror = null;
      elevenLabsAudioRef.current = null;
    }
    
    if (communicationModeRef.current === 'audio-only') {
      setTimeout(() => {
          toggleListeningRef.current(true); 
      }, 1000);
    }
  }, [addMessage, messages]);


  const browserSpeakInternal = useCallback((text: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (window.speechSynthesis.speaking) window.speechSynthesis.cancel(); 
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 1; utterance.rate = 1;
      utterance.onstart = handleActualAudioStart; // Sets isSpeaking true
      utterance.onend = () => handleAudioProcessEnd(true);
      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        console.error("Browser Speech Synthesis error:", event.error);
        if (event.error !== 'interrupted') { 
          toast({ title: "Browser TTS Error", description: `Error: ${event.error || 'Unknown speech synthesis error'}.`, variant: "destructive" });
        }
        handleAudioProcessEnd(false); // Sets isSpeaking false
      };
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn("Browser Speech Synthesis not supported.");
      toast({ title: "TTS Not Supported", description: "Browser does not support speech synthesis.", variant: "default" });
      handleAudioProcessEnd(false); // Sets isSpeaking false
    }
  }, [toast, handleActualAudioStart, handleAudioProcessEnd]);

  const speakText = useCallback(async (text: string) => {
    const processedText = text.replace(/EZCORP/gi, "E. Z. Corp");
    handleAudioProcessStart(processedText); 

    if (communicationModeRef.current === 'text-only' || processedText.trim() === "") {
      if (currentAiResponseTextRef.current) { 
           if (!messages.find(m => m.text === currentAiResponseTextRef.current && m.sender === 'ai')) {
             addMessage(currentAiResponseTextRef.current, 'ai');
           }
      }
      currentAiResponseTextRef.current = null;
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
          audio.onplay = handleActualAudioStart; // Sets isSpeaking true
          audio.onended = () => handleAudioProcessEnd(true); // Sets isSpeaking false
          audio.onerror = (e) => {
            console.error("Error playing ElevenLabs audio:", e);
            toast({ title: "ElevenLabs Playback Error", description: "Could not play audio. Falling back to browser TTS.", variant: "destructive" });
            browserSpeakInternal(processedText); 
          };
          await audio.play();
          return; 
        } else {
          let errorDetails = "Unknown error"; let specificAdvice = "Check console for details.";
          try {
            const errorData = await response.json(); errorDetails = errorData?.detail?.message || JSON.stringify(errorData);
            if (response.status === 401) specificAdvice = "Invalid ElevenLabs API Key.";
            else if (response.status === 404 && errorData?.detail?.status === "voice_not_found") specificAdvice = "ElevenLabs Voice ID not found.";
            else if (errorData?.detail?.message) specificAdvice = `ElevenLabs: ${errorData.detail.message}.`;
            else if (response.status === 422) { const messagesArr = Array.isArray(errorData?.detail) ? errorData.detail.map((err: any) => err.msg).join(', ') : 'Invalid request.'; specificAdvice = `ElevenLabs (422): ${messagesArr}.`;}
          } catch (e) { errorDetails = await response.text(); specificAdvice = `ElevenLabs API Error ${response.status}. Response: ${errorDetails.substring(0,100)}...`; }
          console.error("ElevenLabs API error:", response.status, errorDetails);
          toast({ title: "ElevenLabs TTS Error", description: `${specificAdvice} Falling back to browser TTS.`, variant: "destructive", duration: 7000 });
        }
      } catch (error) {
        console.error("Error calling ElevenLabs API:", error);
        toast({ title: "ElevenLabs Connection Error", description: "Could not connect to ElevenLabs. Falling back to browser TTS.", variant: "destructive" });
      }
    }
    browserSpeakInternal(processedText);
  }, [
      elevenLabsApiKey,
      elevenLabsVoiceId,
      toast,
      handleActualAudioStart,
      handleAudioProcessEnd,
      addMessage,
      browserSpeakInternal,
      handleAudioProcessStart,
      messages // messages is needed for addMessage check
    ]);

  const speakTextRef = useRef(speakText);
  useEffect(() => { speakTextRef.current = speakText; }, [speakText]);

  const handleSendMessage = useCallback(async (text: string, method: 'text' | 'voice') => {
    if (text.trim() === '') return;
    addMessage(text, 'user');
    setIsSendingMessage(true);
    currentAiResponseTextRef.current = null; 

    const genkitChatHistory = messages 
        .filter(msg => msg.text && msg.text.trim() !== "") 
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
      await speakTextRef.current(result.aiResponse); 
    } catch (error) {
      console.error("Failed to get AI response:", error);
      const errorMessage = "Sorry, I encountered an error. Please try again.";
      await speakTextRef.current(errorMessage); 
    }
  }, [addMessage, messages, personaTraits]); 

  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => { handleSendMessageRef.current = handleSendMessage; }, [handleSendMessage]);

  const inputValueRef = useRef(inputValue);
  useEffect(() => { inputValueRef.current = inputValue; }, [inputValue]);


  const initializeSpeechRecognition = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      if (communicationModeRef.current === 'audio-only' || communicationModeRef.current === 'audio-text') {
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
      // Update inputValueRef directly for onend, setInputValue for UI updates
      inputValueRef.current = finalTranscript || interimTranscript;
      setInputValue(finalTranscript || interimTranscript); 
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      // Important: Set isListening to false *before* potentially triggering speakText
      setIsListening(false); 

      if (event.error === 'no-speech' && communicationModeRef.current === 'audio-only') {
        speakTextRef.current("Hello? Is someone there?");
        // The re-listening will be handled by handleAudioProcessEnd after the AI speaks
      } else if (event.error !== 'no-speech' && event.error !== 'aborted' && event.error !== 'network') {
        toast({ title: "Microphone Error", description: `Mic error: ${event.error}. Please check permissions.`, variant: "destructive" });
      }
      // For 'aborted', 'network', or 'no-speech' in non-audio-only modes, we just stop listening.
    };

    recognition.onend = () => {
      const finalTranscript = inputValueRef.current; 
      // isListening should already be false if onend is called after an error or natural stop.
      // If it was a natural end (speech detected), ensure isListening becomes false.
      // If it was an error, onerror already set it.
      setIsListening(false); 

      if (finalTranscript && finalTranscript.trim()) {
        handleSendMessageRef.current(finalTranscript, 'voice');
      }
      setInputValue(''); 
      inputValueRef.current = '';
    };
    return recognition;
  }, [toast, setInputValue, handleSendMessageRef, speakTextRef]); 

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
  }, [initializeSpeechRecognition]); 

 useEffect(() => {
    const recInstance = recognitionRef.current;

    if (isListening) {
      if (!recInstance || communicationModeRef.current === 'text-only' || isSpeakingRef.current) {
        // If conditions aren't right to start listening, ensure isListening is false.
        if (isListening) setIsListening(false);
        return;
      }

      setInputValue(''); 
      inputValueRef.current = '';
      try {
        recInstance.start();
      } catch (error: any) {
        console.error('EFFECT: Error starting speech recognition:', error);
        if (error.name !== 'InvalidStateError' && error.name !== 'NoMicPermissionError') { // InvalidStateError can happen if stop/start overlap
          toast({
            variant: 'destructive',
            title: 'Microphone Start Error',
            description: error.message || 'Could not start microphone. Check permissions.',
          });
        }
        setIsListening(false); 
      }
    } else { 
      if (recInstance) {
        try {
          // Check if recognition is actually running before trying to stop
          // This check is not standard, so we rely on try/catch for InvalidStateError
          recInstance.stop();
        } catch (e: any) {
          if (e.name !== 'InvalidStateError') {
            // console.warn("Error stopping speech recognition:", e);
          }
        }
      }
    }
  }, [isListening, toast, setInputValue]); 


  const resetConversation = useCallback(() => {
    setMessages([]);
    setIsSendingMessage(false);
    setAiHasInitiatedConversation(false);
    setInputValue('');
    inputValueRef.current = '';
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
      window.speechSynthesis.cancel(); // This can trigger 'interrupted' error, handled in browserSpeakInternal
    }
    setIsSpeaking(false); 

    if (recognitionRef.current) {
      recognitionRef.current.abort(); // This can trigger 'aborted' error, handled in onerror
    }
    setIsListening(false);
  }, []);


  const handleChangeCommunicationMode = () => {
    resetConversation(); // Resets isListening to false
    setCommunicationMode(prevMode => {
      const newMode = prevMode === 'audio-text' ? 'text-only' : (prevMode === 'text-only' ? 'audio-only' : 'audio-text');
      communicationModeRef.current = newMode; // Update ref immediately for next cycle
      return newMode;
    });
  };

  const modeButtonText = () => {
    if (communicationMode === 'audio-text') return "Switch to Text-Only";
    if (communicationMode === 'text-only') return "Switch to Audio-Only";
    return "Switch to Audio & Text";
  };

  useEffect(() => {
    if (!aiHasInitiatedConversation && personaTraits && messages.length === 0 && !isSpeakingRef.current && !isSendingMessage) {
      setIsSendingMessage(true); 
      setAiHasInitiatedConversation(true);
      const initGreeting = async () => {
        try {
          const result = await generateInitialGreeting({ personaTraits });
          await speakTextRef.current(result.greetingMessage);
        } catch (error) {
          console.error("Failed to get initial AI greeting:", error);
          const errMsg = "Hello! I had a little trouble starting up. Please try changing modes or refreshing.";
          await speakTextRef.current(errMsg);
        }
      };
      initGreeting();
    }
  }, [aiHasInitiatedConversation, personaTraits, messages.length, isSendingMessage]); 

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
    
    // Initial setup of communicationModeRef
    communicationModeRef.current = communicationMode;

    return () => {
      resetConversation(); 
    };
  }, [resetConversation, communicationMode]); // Add communicationMode to update ref on initial load


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
  
  const showPreparingGreeting = !aiHasInitiatedConversation && isSendingMessage && messages.length === 0;

  const mainContent = () => {
    if (communicationMode === 'audio-only') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center py-8">
          <Image {...imageProps} />
          <h2 className="mt-6 text-3xl font-bold font-headline text-primary">AI Blair</h2>
          {showPreparingGreeting && (
             <div className="mt-4 flex items-center justify-center p-3 rounded-lg bg-secondary text-secondary-foreground shadow animate-pulse">
                Preparing greeting...
            </div>
          )}
          {messages.length > 0 && (
            <div className="w-full max-w-md mt-6">
                 <ConversationLog messages={messages} isLoadingAiResponse={isSendingMessage && aiHasInitiatedConversation} avatarSrc={avatarSrc} />
            </div>
          )}
          {isListening && (
             <div className="mt-4 flex items-center justify-center p-3 rounded-lg bg-accent text-accent-foreground shadow animate-pulse">
                <Mic size={20} className="mr-2"/> Listening...
            </div>
          )}
          {aiHasInitiatedConversation && !isListening && !isSendingMessage && !isSpeaking && messages.length > 0 && (
             <Button onClick={() => toggleListeningRef.current(true)} variant="outline" size="lg" className="mt-6">
                <Mic size={24} className="mr-2"/> Speak
            </Button>
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
              {showPreparingGreeting && (
                <p className="mt-2 text-center text-base font-semibold text-muted-foreground animate-pulse">
                  Preparing greeting...
                </p>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="md:col-span-2 flex flex-col h-full">
          <ConversationLog messages={messages} isLoadingAiResponse={isSendingMessage && aiHasInitiatedConversation} avatarSrc={avatarSrc} />
          <MessageInput
            onSendMessage={handleSendMessageRef.current}
            isSending={isSendingMessage}
            isSpeaking={isSpeaking} 
            showMicButton={communicationModeRef.current === 'audio-text'}
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

