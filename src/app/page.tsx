
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ConversationLog from '@/components/chat/ConversationLog';
import MessageInput from '@/components/chat/MessageInput';
import { generateChatResponse, type GenerateChatResponseInput } from '@/ai/flows/generate-chat-response';
import { generateInitialGreeting } from '@/ai/flows/generate-initial-greeting';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { RotateCcw, Mic, Square as SquareIcon, CheckCircle } from 'lucide-react';

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

export type CommunicationMode = 'audio-text' | 'text-only' | 'audio-only';

const SpeechRecognitionAPI = (typeof window !== 'undefined') ? window.SpeechRecognition || (window as any).webkitSpeechRecognition : null;

export default function HomePage() {
  const [showSplashScreen, setShowSplashScreen] = useState(true);
  const [selectedInitialMode, setSelectedInitialMode] = useState<CommunicationMode>('audio-text');
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string>(DEFAULT_AVATAR_SRC);
  const [personaTraits, setPersonaTraits] = useState<string>(DEFAULT_PERSONA_TRAITS);
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState<string | null>(null);
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [communicationMode, setCommunicationMode] = useState<CommunicationMode>('audio-text'); // Will be set by splash screen
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
  
  const toggleListeningRef = useRef<(forceState?: boolean) => void>(() => {});
  const speakTextRef = useRef<(text: string) => Promise<void>>(async () => {});
  const handleSendMessageRef = useRef<(text: string, method: 'text' | 'voice') => Promise<void>>(async () => {});
  const inputValueRef = useRef(inputValue);
  useEffect(() => { inputValueRef.current = inputValue; }, [inputValue]);


  const addMessage = useCallback((text: string, sender: 'user' | 'ai') => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: Date.now().toString() + Math.random(), text, sender, timestamp: Date.now() },
    ]);
  }, []);

  const toggleListening = useCallback((forceState?: boolean) => {
    setIsListening(currentIsListening => {
      const targetState = typeof forceState === 'boolean' ? forceState : !currentIsListening;

      if (targetState === true) { 
        if (!recognitionRef.current) {
          if (communicationModeRef.current === 'audio-only' || communicationModeRef.current === 'audio-text') {
            toast({ title: "Mic Not Supported", description: "Speech recognition is not initialized.", variant: "destructive" });
          }
          return false;
        }
        if (isSpeakingRef.current) {
           if (forceState !== false) { // Allow forcing off even if speaking
            toast({ title: "Please Wait", description: "AI Blair is currently speaking.", variant: "default" });
            return false;
           }
        }
        if (communicationModeRef.current === 'text-only') {
           return false; 
        }
      }
      return targetState;
    });
  }, [toast]); 
  
  useEffect(() => {
    toggleListeningRef.current = toggleListening;
  }, [toggleListening]);


  const handleAudioProcessStart = useCallback((text: string) => {
    currentAiResponseTextRef.current = text;
  }, []);

  const handleActualAudioStart = useCallback(() => {
    setIsSpeaking(true);
    if (currentAiResponseTextRef.current) {
      if (!messages.find(m => m.text === currentAiResponseTextRef.current && m.sender === 'ai')) {
          addMessage(currentAiResponseTextRef.current, 'ai');
      }
    }
    setIsSendingMessage(false); 
  }, [addMessage, messages]);


  const handleAudioProcessEnd = useCallback((audioPlayedSuccessfully: boolean) => {
    setIsSpeaking(false);

    if (!audioPlayedSuccessfully && currentAiResponseTextRef.current) {
       if (!messages.find(m => m.text === currentAiResponseTextRef.current && m.sender === 'ai')) {
            addMessage(currentAiResponseTextRef.current, 'ai');
       }
    } else if (audioPlayedSuccessfully && currentAiResponseTextRef.current) {
        if (!messages.find(m => m.text === currentAiResponseTextRef.current && m.sender === 'ai')) {
            addMessage(currentAiResponseTextRef.current, 'ai');
        }
    }
    currentAiResponseTextRef.current = null; 
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
    
    if (communicationModeRef.current === 'audio-only') {
      setTimeout(() => {
        if (isSpeakingRef.current) { 
          console.log("Audio-only mode: AI is still speaking, deferring auto-listen trigger.");
          return; 
        }
        console.log("Audio-only mode: AI finished, attempting to auto-listen after delay.");
        toggleListeningRef.current(true); 
      }, 1500); 
    }
  }, [addMessage, messages]); 


  const browserSpeakInternal = useCallback((text: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (window.speechSynthesis.speaking) window.speechSynthesis.cancel(); 
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 1; utterance.rate = 1;
      utterance.onstart = handleActualAudioStart; 
      utterance.onend = () => handleAudioProcessEnd(true);
      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        console.error("Browser Speech Synthesis error:", event.error);
         if (event.error !== 'interrupted') { 
            toast({ title: "Browser TTS Error", description: `Error: ${event.error || 'Unknown speech synthesis error'}.`, variant: "destructive" });
        }
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
          audio.onplay = handleActualAudioStart; 
          audio.onended = () => handleAudioProcessEnd(true); 
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
      messages
    ]);
  
  useEffect(() => {
    speakTextRef.current = speakText;
  }, [speakText]);

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
  
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);


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
      inputValueRef.current = finalTranscript || interimTranscript;
      setInputValue(finalTranscript || interimTranscript); 
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.log(`SpeechRecognition.onerror fired. Error: "${event.error}", Mode: "${communicationModeRef.current}"`);
      setIsListening(false);

      if (event.error === 'no-speech' && communicationModeRef.current === 'audio-only') {
        console.log("Condition met: 'no-speech' in 'audio-only'. Speaking prompt.");
        speakTextRef.current("Hello? Is someone there?");
      } else if (event.error !== 'no-speech' && event.error !== 'aborted' && event.error !== 'network') {
        console.log(`Condition met for toast. Error: "${event.error}" is not 'no-speech', 'aborted', or 'network'.`);
        toast({ title: "Microphone Error", description: `Mic error: ${event.error}. Please check permissions.`, variant: "destructive" });
      } else {
        console.log(`Error "${event.error}" occurred, but no toast will be shown due to specific handling or benign nature.`);
      }
    };

    recognition.onend = () => {
      console.log("SpeechRecognition.onend fired.");
      const finalTranscript = inputValueRef.current; 
      setIsListening(false); 

      if (finalTranscript && finalTranscript.trim()) {
        handleSendMessageRef.current(finalTranscript, 'voice');
      }
      setInputValue(''); 
      inputValueRef.current = '';
    };
    return recognition;
  }, [toast]);

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
    if (!recInstance) return;

    if (isListening) {
      if (communicationModeRef.current === 'text-only' || isSpeakingRef.current) {
        if (isListening) setIsListening(false); 
        return;
      }

      setInputValue(''); 
      inputValueRef.current = '';
      try {
        console.log("EFFECT: Attempting to start speech recognition.");
        recInstance.start();
        console.log("EFFECT: Speech recognition started successfully.");
      } catch (error: any) {
        console.error('EFFECT: Error starting speech recognition:', error);
        console.error('EFFECT: Error name:', error.name);
        console.error('EFFECT: Error message:', error.message);
        if (error.name !== 'InvalidStateError' && error.name !== 'NoMicPermissionError' && error.name !== 'AbortError') {
          toast({
            variant: 'destructive',
            title: 'Microphone Start Error',
            description: `${error.name}: ${error.message || 'Could not start microphone. Check permissions.'}`,
          });
        } else {
          console.log(`EFFECT: Suppressed toast for error: ${error.name}`);
        }
        setIsListening(false); 
      }
    } else { 
      if (recInstance) {
        try {
          recInstance.stop();
        } catch (e: any) {
          if (e.name !== 'InvalidStateError') {
             // console.warn("EFFECT: Error stopping speech recognition (but not InvalidStateError):", e);
          }
        }
      }
    }
  }, [isListening, toast]); 


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
      window.speechSynthesis.cancel(); 
    }
    setIsSpeaking(false); 

    if (recognitionRef.current) {
      recognitionRef.current.abort(); 
    }
    setIsListening(false);
  }, []);

  const handleModeSelectionSubmit = () => {
    resetConversation();
    setCommunicationMode(selectedInitialMode);
    setShowSplashScreen(false);
  };

  const handleChangeCommunicationMode = () => {
    resetConversation(); 
    setCommunicationMode(prevMode => {
      const newMode = prevMode === 'audio-text' ? 'text-only' : (prevMode === 'text-only' ? 'audio-only' : 'audio-text');
      return newMode;
    });
  };

  const modeButtonText = () => {
    if (communicationMode === 'audio-text') return "Switch to Text-Only";
    if (communicationMode === 'text-only') return "Switch to Audio-Only";
    return "Switch to Audio & Text";
  };

  useEffect(() => {
    if (!showSplashScreen && !aiHasInitiatedConversation && personaTraits && messages.length === 0 && !isSpeakingRef.current && !isSendingMessage) {
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
  }, [showSplashScreen, aiHasInitiatedConversation, personaTraits, messages.length, isSendingMessage]);

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
    
    const performResetOnUnmount = resetConversation;
    return () => {
      performResetOnUnmount(); 
    };
  }, [resetConversation]);


  if (showSplashScreen) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-headline text-primary">Welcome to AI Blair</CardTitle>
            <CardDescription>Choose your preferred way to interact.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-6">
            <Image
              src="https://i.imgur.com/U50t4xR.jpeg"
              alt="AI Blair Splash"
              width={400}
              height={267}
              className="rounded-lg shadow-md object-cover"
              priority
              data-ai-hint="man microphone computer"
            />
            <p className="text-xl font-semibold text-foreground">Chat with AI Blair</p>
            <RadioGroup 
              value={selectedInitialMode} 
              onValueChange={(value: CommunicationMode) => setSelectedInitialMode(value)}
              className="w-full space-y-2"
            >
              <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="audio-only" id="r1" />
                <Label htmlFor="r1" className="flex-grow cursor-pointer text-base">Audio Only</Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="audio-text" id="r2" />
                <Label htmlFor="r2" className="flex-grow cursor-pointer text-base">Audio & Text (Recommended)</Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="text-only" id="r3" />
                <Label htmlFor="r3" className="flex-grow cursor-pointer text-base">Text Only</Label>
              </div>
            </RadioGroup>
            <Button onClick={handleModeSelectionSubmit} size="lg" className="w-full">
              <CheckCircle className="mr-2"/>
              Start Chatting
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }


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
