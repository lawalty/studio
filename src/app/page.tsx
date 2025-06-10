
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
import { Label } from '@/components/ui/label';
import { RotateCcw, Mic, Square as SquareIcon, CheckCircle, Power } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


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
const DEFAULT_AVATAR_SRC = "https://placehold.co/300x300.png"; // This is a placeholder, actual default is from persona page.
const PERSONA_STORAGE_KEY = "aiBlairPersona";
const DEFAULT_PERSONA_TRAITS = "You are AI Blair, a knowledgeable and helpful assistant specializing in the pawn store industry. You are professional, articulate, and provide clear, concise answers based on your knowledge base. Your tone is engaging and conversational.";
const API_KEYS_STORAGE_KEY = "aiBlairApiKeys";
const SPLASH_IMAGE_STORAGE_KEY = "aiBlairSplashScreenImage";
const DEFAULT_SPLASH_IMAGE_SRC = "https://i.imgur.com/U50t4xR.jpeg";


export type CommunicationMode = 'audio-text' | 'text-only' | 'audio-only';

const SpeechRecognitionAPI = (typeof window !== 'undefined') ? window.SpeechRecognition || (window as any).webkitSpeechRecognition : null;
const MAX_SILENCE_PROMPTS = 3;

export default function HomePage() {
  const [showSplashScreen, setShowSplashScreen] = useState(true);
  const [selectedInitialMode, setSelectedInitialMode] = useState<CommunicationMode>('audio-text');
  const [splashImageSrc, setSplashImageSrc] = useState<string>(DEFAULT_SPLASH_IMAGE_SRC);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string>(DEFAULT_AVATAR_SRC); // Will be updated from localStorage
  const [personaTraits, setPersonaTraits] = useState<string>(DEFAULT_PERSONA_TRAITS);
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState<string | null>(null);
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [communicationMode, setCommunicationMode] = useState<CommunicationMode>('audio-text');
  const [aiHasInitiatedConversation, setAiHasInitiatedConversation] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [consecutiveSilencePrompts, setConsecutiveSilencePrompts] = useState(0);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLogForSaveConfirmation, setShowLogForSaveConfirmation] = useState(false);


  const elevenLabsAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAiResponseTextRef = useRef<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();

  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  const communicationModeRef = useRef(communicationMode);
  useEffect(() => { communicationModeRef.current = communicationMode; }, [communicationMode]);

  const inputValueRef = useRef(inputValue);
  useEffect(() => { inputValueRef.current = inputValue; }, [inputValue]);
  
  const isListeningRef = useRef(isListening);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  
  const isEndingSessionRef = useRef(false);

  const addMessage = useCallback((text: string, sender: 'user' | 'ai') => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: Date.now().toString() + Math.random(), text, sender, timestamp: Date.now() },
    ]);
  }, []);


  const resetConversation = useCallback(() => {
    setMessages([]);
    setIsSendingMessage(false);
    setAiHasInitiatedConversation(false);
    setInputValue('');
    currentAiResponseTextRef.current = null;
    setConsecutiveSilencePrompts(0);
    isEndingSessionRef.current = false;
    setShowLogForSaveConfirmation(false);
    setShowSaveDialog(false);


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
        if (isSpeakingRef.current && forceState !== false) { 
            toast({ title: "Please Wait", description: "AI Blair is currently speaking.", variant: "default" });
            return currentIsListening; 
        }
        if (communicationModeRef.current === 'text-only') {
           return false;
        }
      }
      return targetState;
    });
  }, [toast]);
  
  const toggleListeningRef = useRef(toggleListening);
  useEffect(() => {
    toggleListeningRef.current = toggleListening;
  }, [toggleListening]);


  const handleAudioProcessStart = useCallback((text: string) => {
    currentAiResponseTextRef.current = text;
  }, []);

  const handleActualAudioStart = useCallback(() => {
    setIsSpeaking(true);
    setIsSendingMessage(false); 
  }, []);


  const handleAudioProcessEnd = useCallback((audioPlayedSuccessfully: boolean) => {
    setIsSpeaking(false);

    if (isEndingSessionRef.current) {
      isEndingSessionRef.current = false; 
      resetConversation();
      setShowSplashScreen(true);
      return; 
    }

    if (!audioPlayedSuccessfully && currentAiResponseTextRef.current) {
       if (!messages.find(m => m.text === currentAiResponseTextRef.current && m.sender === 'ai')) {
            addMessage(currentAiResponseTextRef.current, 'ai');
       }
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

    if (communicationModeRef.current === 'audio-only' && !isEndingSessionRef.current) {
      setTimeout(() => {
        if (isSpeakingRef.current) {
          return;
        }
        if (!isEndingSessionRef.current && !isListeningRef.current) { 
            toggleListeningRef.current(true);
        }
      }, 1500); 
    }
  }, [addMessage, messages, resetConversation, setShowSplashScreen, setIsSpeaking, setIsSendingMessage]);


  const browserSpeakInternal = useCallback((text: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (window.speechSynthesis.speaking) window.speechSynthesis.cancel(); 
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 1; utterance.rate = 1; 
      utterance.onstart = handleActualAudioStart;
      utterance.onend = () => handleAudioProcessEnd(true);
      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        console.error("Browser Speech Synthesis error:", event.error, event);
        if (event.error !== 'interrupted') { 
          toast({ title: "Browser TTS Error", description: `Error: ${event.error || 'Unknown speech synthesis error'}. Check console.`, variant: "destructive" });
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

    if (processedText.trim() !== "" && currentAiResponseTextRef.current) {
        if (!messages.find(m => m.text === currentAiResponseTextRef.current && m.sender === 'ai')) {
            addMessage(currentAiResponseTextRef.current, 'ai');
        }
    }

    if (communicationModeRef.current === 'text-only' || processedText.trim() === "") {
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
      messages, 
      browserSpeakInternal,
      handleAudioProcessStart,
    ]);

  const speakTextRef = useRef(speakText);
  useEffect(() => {
    speakTextRef.current = speakText;
  }, [speakText]);

  const handleSendMessage = useCallback(async (text: string, method: 'text' | 'voice') => {
    if (text.trim() === '') return;
    addMessage(text, 'user');
    setIsSendingMessage(true);
    setConsecutiveSilencePrompts(0); 
    isEndingSessionRef.current = false; 

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
      setIsSendingMessage(false); // Ensure sending state is reset on error
    } 
  }, [addMessage, messages, personaTraits]); 

  const handleSendMessageRef = useRef(handleSendMessage);
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
      setInputValue(finalTranscript || interimTranscript); 
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false); 
      if (event.error === 'no-speech' && communicationModeRef.current === 'audio-only') {
        if (!isSpeakingRef.current && !isEndingSessionRef.current) { 
          setConsecutiveSilencePrompts(currentPrompts => {
            const newPromptCount = currentPrompts + 1;
            if (!isSpeakingRef.current && !isEndingSessionRef.current) { // Double check state before speaking
                if (newPromptCount >= MAX_SILENCE_PROMPTS) {
                    isEndingSessionRef.current = true; 
                    speakTextRef.current("It seems no one is here. Ending the session.");
                } else {
                    speakTextRef.current("Hello? Is someone there?");
                }
            }
            return newPromptCount;
          });
        }
      } else if (event.error !== 'no-speech' && event.error !== 'aborted' && event.error !== 'network' && event.error !== 'interrupted' && (event as any).name !== 'AbortError') {
        toast({ title: "Microphone Error", description: `Mic error: ${event.error}. Please check permissions.`, variant: "destructive" });
      }
    };

    recognition.onend = () => {
      const finalTranscript = inputValueRef.current; 
      if (finalTranscript && finalTranscript.trim() && !isEndingSessionRef.current) {
        handleSendMessageRef.current(finalTranscript, 'voice');
      }
      setInputValue(''); 
      setIsListening(false); 
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
    if (!recInstance) {
      return;
    }

    if (isListening) {
      if (communicationModeRef.current === 'text-only' || isSpeakingRef.current) {
        if (isListening) setIsListening(false); 
        return;
      }

      setInputValue(''); 
      try {
        try { 
          recInstance.abort(); 
        } catch (stopError: any) {
          if (stopError.name !== 'InvalidStateError') {
            // console.warn('EFFECT: Non-critical error stopping recognition before start:', stopError);
          }
        }
        recInstance.start();
      } catch (startError: any) {
        console.error('EFFECT: Error starting speech recognition:', startError.name, startError.message);
        if (startError.name !== 'InvalidStateError' && startError.name !== 'NoMicPermissionError' && startError.name !== 'AbortError') {
          toast({
            variant: 'destructive',
            title: 'Microphone Start Error',
            description: `${startError.name}: ${startError.message || 'Could not start microphone. Check permissions.'}`,
          });
        }
        setIsListening(false); 
      }
    } else { 
      try {
        recInstance.abort(); 
      } catch (e: any) {
        if (e.name !== 'InvalidStateError') {
           // console.warn("EFFECT: Error aborting speech recognition (but not InvalidStateError):", e);
        }
      }
    }
  }, [isListening, toast, setInputValue]); 


  const handleModeSelectionSubmit = () => {
    resetConversation(); 
    setCommunicationMode(selectedInitialMode);
    setShowSplashScreen(false);
  };

  const handleEndChatManually = () => {
    if (communicationMode === 'audio-only') {
        if (isListeningRef.current) {
            toggleListeningRef.current(false); 
        }
        if (isSpeakingRef.current) {
            if (elevenLabsAudioRef.current && elevenLabsAudioRef.current.src && !elevenLabsAudioRef.current.paused) {
                elevenLabsAudioRef.current.pause();
                if (elevenLabsAudioRef.current.src.startsWith('blob:')) {
                    URL.revokeObjectURL(elevenLabsAudioRef.current.src);
                }
                elevenLabsAudioRef.current.src = ''; 
            }
            if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
            }
            setIsSpeaking(false); 
        }
        
        setShowLogForSaveConfirmation(true);
        setShowSaveDialog(true);
    } else {
      resetConversation();
      setShowSplashScreen(true);
    }
  };

  const handleSaveConversationAsPdf = () => {
    console.log("Conversation Messages for PDF (placeholder):", messages);
    toast({
      title: "PDF Export (Placeholder)",
      description: "PDF generation is a future feature. Conversation logged to console.",
      duration: 5000,
    });
  };

  const handleCloseSaveDialog = (shouldSave: boolean) => {
    setShowSaveDialog(false);
    if (shouldSave) {
      handleSaveConversationAsPdf();
    }
    setShowLogForSaveConfirmation(false); 
    resetConversation();
    setShowSplashScreen(true);
  };


  const handleChangeCommunicationMode = () => {
    resetConversation(); 
    setCommunicationMode(prevMode => {
      const newMode = prevMode === 'audio-text' ? 'text-only' : (prevMode === 'text-only' ? 'audio-only' : 'audio-text');
      if ((newMode === 'audio-text' || newMode === 'audio-only') && !recognitionRef.current) {
        recognitionRef.current = initializeSpeechRecognition(); 
      }
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
          setIsSendingMessage(false); // Reset on error
        }
      };
      initGreeting();
    }
  }, [showSplashScreen, aiHasInitiatedConversation, personaTraits, messages.length, isSendingMessage]); 

  useEffect(() => {
    // Load avatar from localStorage or use default placeholder from Persona page
    const storedAvatar = localStorage.getItem(AVATAR_STORAGE_KEY);
    setAvatarSrc(storedAvatar || "https://placehold.co/150x150.png?text=Avatar"); // Use persona's default if nothing
    
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
    
    const storedSplashImage = localStorage.getItem(SPLASH_IMAGE_STORAGE_KEY);
    setSplashImageSrc(storedSplashImage || DEFAULT_SPLASH_IMAGE_SRC); 
  }, []);

  const performResetOnUnmountRef = useRef(resetConversation);
  useEffect(() => {
    performResetOnUnmountRef.current = resetConversation;
  }, [resetConversation]);

  useEffect(() => {
    const performResetOnUnmount = performResetOnUnmountRef.current;
    return () => {
      performResetOnUnmount();
    };
  }, []); 


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
              src={splashImageSrc}
              alt="AI Blair Splash"
              width={400}
              height={267} 
              className="rounded-lg shadow-md object-cover"
              priority 
              data-ai-hint={splashImageSrc === DEFAULT_SPLASH_IMAGE_SRC ? "man microphone computer" : "custom splash image"}
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

  const placeholderAvatar = "https://placehold.co/150x150.png?text=Avatar"; // Default from Persona page
  const currentAvatar = avatarSrc && avatarSrc !== DEFAULT_AVATAR_SRC ? avatarSrc : placeholderAvatar;


  const imageProps: React.ComponentProps<typeof Image> & { 'data-ai-hint'?: string } = {
    src: currentAvatar, // Use currentAvatar which respects localStorage or placeholder
    alt: "AI Blair Avatar",
    width: communicationMode === 'audio-only' ? 200 : 120,
    height: communicationMode === 'audio-only' ? 200 : 120,
    className: cn(
      "rounded-full border-4 border-primary shadow-md object-cover transition-all duration-300",
      isSpeaking && "animate-pulse-speak"
    ),
    priority: true,
  };

  if (currentAvatar === placeholderAvatar) {
    imageProps['data-ai-hint'] = "professional woman";
  }
  // If currentAvatar is a Firebase URL (starts with https://firebasestorage.googleapis.com), no hint needed.
  // If currentAvatar is a data URI (from local selection before upload), also no hint needed.

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
          {(messages.length > 0 && showLogForSaveConfirmation) && (
            <div className="w-full max-w-md mt-6">
                 <ConversationLog messages={messages} isLoadingAiResponse={false} avatarSrc={currentAvatar} />
            </div>
          )}
          {isListening && (
             <div className="mt-4 flex items-center justify-center p-3 rounded-lg bg-accent text-accent-foreground shadow animate-pulse">
                <Mic size={20} className="mr-2"/> Listening...
            </div>
          )}
          {aiHasInitiatedConversation && !isListening && !isSendingMessage && !isSpeaking && messages.length > 0 && !showSaveDialog && (
             <Button onClick={() => toggleListeningRef.current(true)} variant="outline" size="lg" className="mt-6">
                <Mic size={24} className="mr-2"/> Speak
            </Button>
          )}
          {aiHasInitiatedConversation && !showSaveDialog && ( 
            <Button
              onClick={handleEndChatManually}
              variant="destructive"
              size="default" 
              className="mt-8"
            >
              <Power className="mr-2 h-5 w-5" /> End Chat
            </Button>
          )}
           <AlertDialog open={showSaveDialog} onOpenChange={(open) => {
             if (!open) { // If dialog is closing
                handleCloseSaveDialog(false); // Assume don't save if closed via X or overlay
             }
             setShowSaveDialog(open);
           }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Save Conversation?</AlertDialogTitle>
                <AlertDialogDescription>
                  Would you like to save the conversation log to your computer as a PDF?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => handleCloseSaveDialog(false)}>Don&apos;t Save</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleCloseSaveDialog(true)}>Save as PDF</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
          <ConversationLog messages={messages} isLoadingAiResponse={isSendingMessage && aiHasInitiatedConversation} avatarSrc={currentAvatar} />
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
      {!showSplashScreen && (
        <div className="py-4 text-center border-t mt-auto">
          <Button onClick={handleChangeCommunicationMode} variant="outline">
            <RotateCcw size={16} className="mr-2" /> {modeButtonText()}
          </Button>
        </div>
      )}
    </div>
  );
}
