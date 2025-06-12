
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ConversationLog from '@/components/chat/ConversationLog';
import MessageInput from '@/components/chat/MessageInput';
import { generateChatResponse, type GenerateChatResponseInput } from '@/ai/flows/generate-chat-response';
import { generateInitialGreeting, type GenerateInitialGreetingInput } from '@/ai/flows/generate-initial-greeting';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from '@/components/ui/label';
import { Mic, Square as SquareIcon, CheckCircle, Power, DatabaseZap, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';


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

const DEFAULT_AVATAR_PLACEHOLDER_URL = "https://placehold.co/150x150.png";
const DEFAULT_PERSONA_TRAITS = "You are AI Blair, a knowledgeable and helpful assistant specializing in the pawn store industry. You are professional, articulate, and provide clear, concise answers based on your knowledge base. Your tone is engaging and conversational.";
const DEFAULT_SPLASH_IMAGE_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE = "Welcome to AI Chat";

const FIRESTORE_API_KEYS_PATH = "configurations/api_keys_config";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";

// New KB paths for High, Medium, Low priority
const FIRESTORE_KB_HIGH_PATH = "configurations/kb_high_meta_v1";
const FIRESTORE_KB_MEDIUM_PATH = "configurations/kb_medium_meta_v1";
const FIRESTORE_KB_LOW_PATH = "configurations/kb_low_meta_v1";


interface PageKnowledgeSource {
    name: string;
    type: string;
    downloadURL?: string;
}


export type CommunicationMode = 'audio-text' | 'text-only' | 'audio-only';

const SpeechRecognitionAPI = (typeof window !== 'undefined') ? window.SpeechRecognition || (window as any).webkitSpeechRecognition : null;
const MAX_SILENCE_PROMPTS = 3; // AI asks "are you there" twice (prompts 1 & 2), ends on 3rd silence.

const getUserNameFromHistory = (history: Message[]): string | null => {
  for (let i = history.length - 1; i >= 0; i--) { // Check recent messages first
    const message = history[i];
    if (message.sender === 'user') {
      const text = message.text; // Keep casing for proper noun extraction
      const namePatterns = [
        /my name is\s+([A-Za-z]+)/i,
        /i'm\s+([A-Za-z]+)/i,
        /i am\s+([A-Za-z]+)/i,
        /call me\s+([A-Za-z]+)/i,
      ];
      for (const pattern of namePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const name = match[1];
          // Capitalize first letter
          return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        }
      }
    }
  }
  return null;
};


export default function HomePage() {
  const [showSplashScreen, setShowSplashScreen] = useState(true);
  const [selectedInitialMode, setSelectedInitialMode] = useState<CommunicationMode>('audio-text');
  const [splashImageSrc, setSplashImageSrc] = useState<string>(DEFAULT_SPLASH_IMAGE_SRC);
  const [splashScreenWelcomeMessage, setSplashScreenWelcomeMessage] = useState<string>(DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE);
  const [isSplashImageLoaded, setIsSplashImageLoaded] = useState(false);


  const [messages, setMessages] = useState<Message[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string>(DEFAULT_AVATAR_PLACEHOLDER_URL);
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

  const [knowledgeFileSummaryHigh, setKnowledgeFileSummaryHigh] = useState<string>('');
  const [knowledgeFileSummaryMedium, setKnowledgeFileSummaryMedium] = useState<string>('');
  const [knowledgeFileSummaryLow, setKnowledgeFileSummaryLow] = useState<string>('');
  const [dynamicKnowledgeContentHigh, setDynamicKnowledgeContentHigh] = useState<string>('');
  const [dynamicKnowledgeContentMedium, setDynamicKnowledgeContentMedium] = useState<string>('');
  const [dynamicKnowledgeContentLow, setDynamicKnowledgeContentLow] = useState<string>('');

  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(true);
  const [corsErrorEncountered, setCorsErrorEncountered] = useState(false);
  const [showPreparingAudioResponseIndicator, setShowPreparingAudioResponseIndicator] = useState(false);


  const elevenLabsAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAiResponseTextRef = useRef<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast, dismiss: dismissAllToasts } = useToast();
  const preparingIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  const communicationModeRef = useRef(communicationMode);
  useEffect(() => { communicationModeRef.current = communicationMode; }, [communicationMode]);

  const inputValueRef = useRef(inputValue);
  useEffect(() => { inputValueRef.current = inputValue; }, [inputValue]);

  const isListeningRef = useRef(isListening);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  const isEndingSessionRef = useRef(false);
  const isAboutToSpeakForSilenceRef = useRef(false);
  
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);


  useEffect(() => {
    if (showSplashScreen) {
      window.dispatchEvent(new CustomEvent('splashScreenActive'));
    } else {
      window.dispatchEvent(new CustomEvent('splashScreenInactive'));
    }
  }, [showSplashScreen]);

  const addMessage = useCallback((text: string, sender: 'user' | 'ai') => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: Date.now().toString() + Math.random(), text, sender, timestamp: Date.now() },
    ]);
  }, []);

  const resetConversation = useCallback(() => {
    dismissAllToasts();
    setMessages([]);
    setIsSendingMessage(false);
    setAiHasInitiatedConversation(false);
    setInputValue('');
    currentAiResponseTextRef.current = null;
    setConsecutiveSilencePrompts(0);
    isEndingSessionRef.current = false;
    isAboutToSpeakForSilenceRef.current = false; 
    setShowLogForSaveConfirmation(false);
    setShowSaveDialog(false);
    setCorsErrorEncountered(false);
    setShowPreparingAudioResponseIndicator(false);
    isSpeakingRef.current = false;
    isListeningRef.current = false;

    if (preparingIndicatorTimeoutRef.current) {
      clearTimeout(preparingIndicatorTimeoutRef.current);
      preparingIndicatorTimeoutRef.current = null;
    }

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
    }

    if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);


    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    setIsListening(false);


  }, [dismissAllToasts]);


  const toggleListening = useCallback((forceState?: boolean) => {
    if (isEndingSessionRef.current && (typeof forceState === 'boolean' && forceState === true)) {
        console.log("[toggleListening] Session is ending, preventing listen start.");
        return;
    }

    setIsListening(currentIsListening => {
      const targetIsListeningState = typeof forceState === 'boolean' ? forceState : !currentIsListening;

      if (targetIsListeningState === true) {
        if (isEndingSessionRef.current) {
          console.log("[toggleListening] Tried to start listening, but session is ending.");
          return false;
        }
        if (!recognitionRef.current) {
          if (communicationModeRef.current === 'audio-only' || communicationModeRef.current === 'audio-text') {
            console.warn("[toggleListening] Speech recognition not initialized.");
          }
          return false;
        }
        if (communicationModeRef.current === 'text-only') {
           console.log("[toggleListening] Text-only mode, not starting listening.");
           return false;
        }
        console.log("[toggleListening] Setting isListening to true.");
        return true;
      } else {
        console.log("[toggleListening] Setting isListening to false.");
        return false;
      }
    });
  }, []);

  const toggleListeningRef = useRef(toggleListening);
  useEffect(() => {
    toggleListeningRef.current = toggleListening;
  }, [toggleListening]);


  const handleAudioProcessStart = useCallback((text: string) => {
    currentAiResponseTextRef.current = text;
  }, []);

  const handleActualAudioStart = useCallback(() => {
    setIsSpeaking(true);
    isSpeakingRef.current = true;
    isAboutToSpeakForSilenceRef.current = false; 
    setShowPreparingAudioResponseIndicator(false);
    if (preparingIndicatorTimeoutRef.current) {
        clearTimeout(preparingIndicatorTimeoutRef.current);
        preparingIndicatorTimeoutRef.current = null;
    }
  }, []);

  const handleAudioProcessEnd = useCallback((audioPlayedSuccessfully: boolean) => {
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    isAboutToSpeakForSilenceRef.current = false; 
    setShowPreparingAudioResponseIndicator(false);
    if (preparingIndicatorTimeoutRef.current) {
        clearTimeout(preparingIndicatorTimeoutRef.current);
        preparingIndicatorTimeoutRef.current = null;
    }

    if (isEndingSessionRef.current) {
      if (communicationModeRef.current === 'audio-only' && !showSaveDialog) {
        setShowLogForSaveConfirmation(true);
        setShowSaveDialog(true);
      } else if (communicationModeRef.current !== 'audio-only' || showSaveDialog) {
        // If not audio-only, or if save dialog was already handled (e.g. manual end), proceed to reset
        resetConversation();
        setShowSplashScreen(true);
      }
      return;
    }

    if (elevenLabsAudioRef.current) {
      if (elevenLabsAudioRef.current.src && elevenLabsAudioRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(elevenLabsAudioRef.current.src);
      }
      elevenLabsAudioRef.current.onplay = null;
      elevenLabsAudioRef.current.onended = null;
      elevenLabsAudioRef.current.onerror = null;
      if (elevenLabsAudioRef.current) elevenLabsAudioRef.current.src = '';
    }

    if (communicationModeRef.current === 'audio-only' && !isEndingSessionRef.current) {
      console.log("[AudioOnly][handleAudioProcessEnd] AI finished speaking. Aborting mic before attempting restart.");
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort(); 
          console.log("[AudioOnly][handleAudioProcessEnd] Recognition aborted successfully.");
        } catch (e: any) {
          console.warn("[AudioOnly][handleAudioProcessEnd] Non-critical error aborting recognition before restart:", e.message);
        }
      }
      isSpeakingRef.current = false; 
      console.log("[AudioOnly][handleAudioProcessEnd] Mic aborted. Calling toggleListening(true) to restart. isSpeakingRef.current is now:", isSpeakingRef.current);
      toggleListeningRef.current(true);
    }
  }, [resetConversation, setShowSplashScreen, showSaveDialog]);


  const browserSpeakInternal = useCallback((textForSpeech: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textForSpeech);
      utterance.pitch = 1; utterance.rate = 1;
      utterance.onstart = handleActualAudioStart;
      utterance.onend = () => handleAudioProcessEnd(true);
      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        console.error("Browser Speech Synthesis error:", event.error, event);
        if (event.error !== 'interrupted' && event.error !== 'aborted') {
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
    handleAudioProcessStart(text);
    const textForSpeech = text.replace(/EZCORP/gi, "easy corp");

    if (communicationModeRef.current === 'text-only' || text.trim() === "") {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      isAboutToSpeakForSilenceRef.current = false; 
      setShowPreparingAudioResponseIndicator(false);
      if (preparingIndicatorTimeoutRef.current) {
          clearTimeout(preparingIndicatorTimeoutRef.current);
          preparingIndicatorTimeoutRef.current = null;
      }
      // In text-only mode, message is already added by caller, so just return.
      return;
    }

    if (elevenLabsAudioRef.current && elevenLabsAudioRef.current.src && !elevenLabsAudioRef.current.ended && !elevenLabsAudioRef.current.paused) {
       console.log("[speakText] Pausing existing ElevenLabs audio.");
       elevenLabsAudioRef.current.pause();
       if (elevenLabsAudioRef.current.src.startsWith('blob:')) {
           URL.revokeObjectURL(elevenLabsAudioRef.current.src);
       }
       elevenLabsAudioRef.current.src = '';
    }
    if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
        console.log("[speakText] Cancelling existing browser synthesis.");
        window.speechSynthesis.cancel();
    }
    setIsSpeaking(false); 
    isSpeakingRef.current = false; 


    if (elevenLabsApiKey && elevenLabsVoiceId) {
      const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`;
      const headers = {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsApiKey,
      };
      const body = JSON.stringify({
        text: textForSpeech,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true }
      });

      try {
        const response = await fetch(elevenLabsUrl, { method: "POST", headers, body });
        if (response.ok) {
          const audioBlob = await response.blob();

          if (audioBlob.size === 0) {
            console.warn("ElevenLabs API returned an empty audio blob. Falling back to browser TTS.");
            toast({ title: "ElevenLabs Audio Issue", description: "Received empty audio data. Using browser TTS.", variant: "default" });
            browserSpeakInternal(textForSpeech);
            return;
          }
          if (!audioBlob.type.startsWith('audio/')) {
            console.warn(`ElevenLabs API returned non-audio content-type: ${audioBlob.type}. Blob size: ${audioBlob.size}. Falling back to browser TTS.`);
            toast({ title: "ElevenLabs Audio Issue", description: `Received unexpected content type: ${audioBlob.type}. Using browser TTS.`, variant: "default" });
            browserSpeakInternal(textForSpeech);
            return;
          }

          const audioUrl = URL.createObjectURL(audioBlob);

          if (!elevenLabsAudioRef.current) {
            elevenLabsAudioRef.current = new Audio();
          }
          const audio = elevenLabsAudioRef.current;
          audio.src = audioUrl;

          audio.onplay = handleActualAudioStart;
          audio.onended = () => handleAudioProcessEnd(true);
          audio.onerror = (e: Event | string) => {
            const mediaError = e instanceof Event ? (e.target as HTMLAudioElement)?.error : null;
            const errorMessage = typeof e === 'string' ? e : (mediaError?.message || 'Unknown audio error');
            const errorCode = mediaError?.code;
            console.error("Error playing ElevenLabs audio. MediaError code:", errorCode, "MediaError message:", errorMessage, "Full event:", e);
            
            if (errorCode === mediaError?.MEDIA_ERR_ABORTED || errorMessage.includes("interrupted by a new load request") || errorMessage.includes("The play() request was interrupted")) {
                console.warn("ElevenLabs playback aborted, likely by a new load request or explicit stop. Not falling back to browser TTS for this specific interruption.");
                handleAudioProcessEnd(false); 
            } else {
                toast({ title: "ElevenLabs Playback Error", description: `Could not play audio (Code: ${errorCode || 'N/A'}). Falling back to browser TTS.`, variant: "destructive" });
                browserSpeakInternal(textForSpeech);
            }
          };
          try {
            await audio.play();
          } catch (playError: any) {
            if (playError.name === 'AbortError' || playError.message.includes("interrupted by a new load request") || playError.message.includes("The play() request was interrupted")) {
                console.warn('ElevenLabs audio.play() was aborted. This is likely due to a new speakText call. Event:', playError);
                handleAudioProcessEnd(false); 
            } else {
                console.error('Error caught during ElevenLabs audio.play():', playError);
                toast({ title: "ElevenLabs Playback Start Error", description: `Could not start audio: ${playError.message}. Falling back to browser TTS.`, variant: "destructive" });
                browserSpeakInternal(textForSpeech);
            }
          }
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
      } catch (error: any) {
        console.error("Error calling ElevenLabs API:", error);
        if (error.name === 'AbortError') {
            console.warn('Fetch to ElevenLabs was aborted.');
        } else {
            toast({ title: "ElevenLabs Connection Error", description: "Could not connect to ElevenLabs. Falling back to browser TTS.", variant: "destructive" });
        }
      }
    }
    browserSpeakInternal(textForSpeech);
  }, [
      elevenLabsApiKey,
      elevenLabsVoiceId,
      toast,
      browserSpeakInternal,
      handleAudioProcessStart,
      handleActualAudioStart,
      handleAudioProcessEnd,
    ]);

  const speakTextRef = useRef(speakText);
  useEffect(() => {
    speakTextRef.current = speakText;
  }, [speakText]);

  const handleSendMessage = useCallback(async (text: string, method: 'text' | 'voice') => {
    if (text.trim() === '') return;
    addMessage(text, 'user');
    
    // Pushes setIsSendingMessage to a later tick, allowing user's message to render first.
    // Increased delay slightly for more visual separation.
    setTimeout(() => {
        setIsSendingMessage(true); // "AI is typing" starts after a slight delay
    }, 50);

    setConsecutiveSilencePrompts(0);
    isEndingSessionRef.current = false;
    isAboutToSpeakForSilenceRef.current = false; 
    setShowPreparingAudioResponseIndicator(false);
    if (preparingIndicatorTimeoutRef.current) {
        clearTimeout(preparingIndicatorTimeoutRef.current);
        preparingIndicatorTimeoutRef.current = null;
    }

    const historyForGenkit = messagesRef.current
        .filter(msg => !(msg.text === text && msg.sender === 'user' && msg.id === messagesRef.current[messagesRef.current.length -1]?.id)) 
        .map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }],
        }));

    const combinedLowPriorityText = [MOCK_KNOWLEDGE_BASE_CONTENT, dynamicKnowledgeContentLow].filter(Boolean).join('\n\n');

    try {
      const flowInput: GenerateChatResponseInput = {
        userMessage: text,
        knowledgeBaseHigh: {
            summary: knowledgeFileSummaryHigh || undefined,
            textContent: dynamicKnowledgeContentHigh || undefined,
        },
        knowledgeBaseMedium: {
            summary: knowledgeFileSummaryMedium || undefined,
            textContent: dynamicKnowledgeContentMedium || undefined,
        },
        knowledgeBaseLow: {
            summary: knowledgeFileSummaryLow || undefined,
            textContent: combinedLowPriorityText || undefined,
        },
        personaTraits: personaTraits,
        chatHistory: historyForGenkit,
      };
      const result = await generateChatResponse(flowInput);
      
      addMessage(result.aiResponse, 'ai'); 
      setIsSendingMessage(false); 

      await speakTextRef.current(result.aiResponse); 
    } catch (error) {
      console.error("Failed to get AI response:", error);
      const errorMessage = "Sorry, I encountered an error. Please try again.";
      
      addMessage(errorMessage, 'ai'); 
      setIsSendingMessage(false);

      await speakTextRef.current(errorMessage); 
    }
  }, [addMessage, personaTraits,
      knowledgeFileSummaryHigh, dynamicKnowledgeContentHigh,
      knowledgeFileSummaryMedium, dynamicKnowledgeContentMedium,
      knowledgeFileSummaryLow, dynamicKnowledgeContentLow]);

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

    recognition.onstart = () => {
      console.log("[Recognition] onStart: Mic has started successfully. isListeningRef.current:", isListeningRef.current);
    };

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
      console.log("[Recognition] onError triggered. Error type:", event.error, "isListeningRef.current:", isListeningRef.current, "Current inputValue:", inputValueRef.current);
       
      if (event.error === 'no-speech' && communicationModeRef.current === 'audio-only') {
        console.log("[Recognition][no-speech] 'no-speech' error detected in Audio Only mode.");
        setIsListening(false);
        isListeningRef.current = false;

        setConsecutiveSilencePrompts(currentPrompts => {
            if (isAboutToSpeakForSilenceRef.current) { 
                console.log(`[Recognition][no-speech][onerror] Already about to speak for silence. Bailing. currentPrompts: ${currentPrompts}`);
                return currentPrompts;
            }
            console.log(`[Recognition][no-speech][onerror] setConsecutiveSilencePrompts called. currentPrompts: ${currentPrompts}, isSpeakingRef.current: ${isSpeakingRef.current}, isEndingSessionRef.current: ${isEndingSessionRef.current}`);
            if (!isSpeakingRef.current && !isEndingSessionRef.current) {
                isAboutToSpeakForSilenceRef.current = true; 
                const newPromptCount = currentPrompts + 1;
                console.log(`[Recognition][no-speech][onerror] Conditions met to process silence. newPromptCount: ${newPromptCount}`);
                if (newPromptCount >= MAX_SILENCE_PROMPTS) {
                    console.log("[Recognition][no-speech][onerror] Max silence prompts reached. Ending session.");
                    isEndingSessionRef.current = true;
                    speakTextRef.current("It looks like you might have stepped away. Let's end this chat. I'll bring up an option to save our conversation.");
                } else {
                    const userName = getUserNameFromHistory(messagesRef.current);
                    const promptMessage = userName ? `${userName}, are you still there?` : "Hello? Is someone there?";
                    console.log(`[Recognition][no-speech][onerror] Prompting for silence: '${promptMessage}'`);
                    speakTextRef.current(promptMessage);
                }
                return newPromptCount;
            }
            console.log(`[Recognition][no-speech][onerror] Conditions NOT met for silence prompt (AI Speaking or Session Ending). AI Speaking: ${isSpeakingRef.current}, Session Ending: ${isEndingSessionRef.current}. Returning currentPrompts: ${currentPrompts}`);
            return currentPrompts;
        });
      } else if (event.error === 'aborted') {
        console.log("[Recognition][onerror] 'aborted'. This is often expected if we stop it manually. isListeningRef.current is now:", isListeningRef.current);
        if (isListeningRef.current) { 
          setIsListening(false);
          isListeningRef.current = false;
        }
      } else if (event.error !== 'no-speech' && event.error !== 'network' && event.error !== 'interrupted' && (event as any).name !== 'AbortError') {
        toast({ title: "Microphone Error", description: `Mic error: ${event.error}. Please check permissions.`, variant: "destructive" });
        setIsListening(false);
        isListeningRef.current = false;
      }
    };

    recognition.onend = () => {
      const finalTranscript = inputValueRef.current;
      console.log("[Recognition] onEnd triggered. isListeningRef.current was:", isListeningRef.current, "inputValueRef.current:", `"${finalTranscript}"`);

      const wasListening = isListeningRef.current; 
      setIsListening(false); 
      isListeningRef.current = false;

      if (finalTranscript && finalTranscript.trim() !== '' && !isEndingSessionRef.current) {
        console.log("[Recognition][onend] Sending transcript:", finalTranscript);
        handleSendMessageRef.current(finalTranscript, 'voice');
      } else if (finalTranscript.trim() === '' && communicationModeRef.current === 'audio-only' && wasListening && !isEndingSessionRef.current && !isSpeakingRef.current ) {
        console.log("[Recognition][onend] Empty transcript in Audio Only mode (no-speech via onend). isSpeakingRef:", isSpeakingRef.current, "wasListening:", wasListening);
        setConsecutiveSilencePrompts(currentPrompts => {
            if (isAboutToSpeakForSilenceRef.current) { 
                console.log(`[Recognition][onend][silence] Already about to speak for silence. Bailing. currentPrompts: ${currentPrompts}`);
                return currentPrompts;
            }
            console.log(`[Recognition][onend][silence] setConsecutiveSilencePrompts called. currentPrompts: ${currentPrompts}, isSpeakingRef.current: ${isSpeakingRef.current}, isEndingSessionRef.current: ${isEndingSessionRef.current}`);
            if (!isSpeakingRef.current && !isEndingSessionRef.current) { 
                isAboutToSpeakForSilenceRef.current = true; 
                const newPromptCount = currentPrompts + 1;
                console.log(`[Recognition][onend][silence] Conditions met to process silence. newPromptCount: ${newPromptCount}`);
                if (newPromptCount >= MAX_SILENCE_PROMPTS) {
                    console.log("[Recognition][onend][silence] Max silence prompts reached. Ending session.");
                    isEndingSessionRef.current = true;
                    speakTextRef.current("It looks like you might have stepped away. Let's end this chat. I'll bring up an option to save our conversation.");
                } else {
                    const userName = getUserNameFromHistory(messagesRef.current);
                    const promptMessage = userName ? `${userName}, are you still there?` : "Hello? Is someone there?";
                    console.log(`[Recognition][onend][silence] Prompting for silence: '${promptMessage}'`);
                    speakTextRef.current(promptMessage);
                }
                return newPromptCount;
            }
            console.log(`[Recognition][onend][silence] Conditions NOT met for silence prompt (AI Speaking or Session Ending). AI Speaking: ${isSpeakingRef.current}, Session Ending: ${isEndingSessionRef.current}. Returning currentPrompts: ${currentPrompts}`);
            return currentPrompts;
        });
      }
      setInputValue('');
    };
    return recognition;
  }, [toast]);

  useEffect(() => {
    const rec = initializeSpeechRecognition();
    recognitionRef.current = rec;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current.onstart = null;
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
      console.log("[useEffect isListening] Recognition instance is null. Returning.");
      return;
    }

    if (isListening) {
      console.log("[useEffect isListening] Target state: true (Listen). Checking conditions...");
      if (communicationModeRef.current === 'text-only') {
        console.warn("[useEffect isListening] Text-only mode. Setting isListening to false.");
        setIsListening(false);
        isListeningRef.current = false;
        return;
      }
      if (isSpeakingRef.current) {
        console.warn("[useEffect isListening] AI is speaking (isSpeakingRef.current is true). Aborting listen attempt by setting isListening to false.");
        setIsListening(false);
        isListeningRef.current = false;
        return;
      }

      console.log("[useEffect isListening] Conditions met (isListening=true, AI not speaking). Clearing inputValue and attempting recognition.start().");
      setInputValue('');
      try {
        recInstance.start();
        console.log("[useEffect isListening] recognition.start() called successfully.");
      } catch (startError: any) {
        console.error('[useEffect isListening] Error starting speech recognition:', startError.name, startError.message);
        if (startError.name !== 'InvalidStateError' && startError.name !== 'NoMicPermissionError' && startError.name !== 'AbortError') {
          toast({
            variant: 'destructive',
            title: 'Microphone Start Error',
            description: `${startError.name}: ${startError.message || 'Could not start microphone. Check permissions.'}`,
          });
        }
        setIsListening(false);
        isListeningRef.current = false;
      }
    } else {
      console.log("[useEffect isListening] Target state: false (Stop Listen). Attempting recognition.abort().");
      try {
        recInstance.abort();
        console.log("[useEffect isListening] recognition.abort() called successfully.");
      } catch (e: any) {
        console.warn("[useEffect isListening] Non-critical error during recognition.abort():", e.message);
      }
    }
  }, [isListening, toast]);

  useEffect(() => {
    if (preparingIndicatorTimeoutRef.current) {
        clearTimeout(preparingIndicatorTimeoutRef.current);
        preparingIndicatorTimeoutRef.current = null;
    }
    setShowPreparingAudioResponseIndicator(false);

    if (
        communicationMode === 'audio-only' &&
        isSendingMessage &&
        !isSpeaking &&
        !isListening
    ) {
        preparingIndicatorTimeoutRef.current = setTimeout(() => {
            if (isSendingMessage && !isSpeaking && !isListening && communicationMode === 'audio-only') {
                 setShowPreparingAudioResponseIndicator(true);
            }
        }, 1200);
    }

    return () => {
        if (preparingIndicatorTimeoutRef.current) {
            clearTimeout(preparingIndicatorTimeoutRef.current);
        }
    };
  }, [isSendingMessage, isSpeaking, isListening, communicationMode]);


  const handleModeSelectionSubmit = () => {
    resetConversation();
    setCommunicationMode(selectedInitialMode);
    setShowSplashScreen(false);
  };

  const handleEndChatManually = () => {
     if (communicationMode === 'audio-only') {
        isEndingSessionRef.current = true;
        isAboutToSpeakForSilenceRef.current = false; 
        console.log("[EndChatManually][AudioOnly] Ending session initiated.");

        if (isListeningRef.current && recognitionRef.current) {
            console.log("[EndChatManually][AudioOnly] Currently listening, stopping mic.");
            recognitionRef.current.abort();
        }
        setIsListening(false);
        isListeningRef.current = false;

        if (isSpeakingRef.current) {
            console.log("[EndChatManually][AudioOnly] AI is speaking, stopping audio.");
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
            isSpeakingRef.current = false;
        }

        if (preparingIndicatorTimeoutRef.current) {
            clearTimeout(preparingIndicatorTimeoutRef.current);
            preparingIndicatorTimeoutRef.current = null;
        }
        setShowPreparingAudioResponseIndicator(false);

        setShowLogForSaveConfirmation(true);
        setShowSaveDialog(true);
    } else {
      resetConversation();
      setShowSplashScreen(true);
    }
  };

  const handleSaveConversationAsPdf = () => {
    console.log("Conversation Messages for PDF (placeholder):", messagesRef.current);
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

  useEffect(() => {
    if (!showSplashScreen && !aiHasInitiatedConversation && personaTraits && messagesRef.current.length === 0 && !isSpeakingRef.current && !isSendingMessage && !isLoadingKnowledge) {
      
      setAiHasInitiatedConversation(true);
      isAboutToSpeakForSilenceRef.current = false; 
      setShowPreparingAudioResponseIndicator(false);

      if (preparingIndicatorTimeoutRef.current) {
        clearTimeout(preparingIndicatorTimeoutRef.current);
        preparingIndicatorTimeoutRef.current = null;
      }
      setIsSpeaking(false); 
      isSpeakingRef.current = false;
      setIsListening(false); 
      isListeningRef.current = false;

      const initGreeting = async () => {
        // Removed setIsSendingMessage(true) from here
        try {
          const greetingInput: GenerateInitialGreetingInput = {
            personaTraits,
            knowledgeBaseHighSummary: knowledgeFileSummaryHigh || undefined,
            knowledgeBaseHighTextContent: dynamicKnowledgeContentHigh || undefined,
          };
          const result = await generateInitialGreeting(greetingInput);
          
          addMessage(result.greetingMessage, 'ai'); 
          // Removed setIsSendingMessage(false) from here
          
          await speakTextRef.current(result.greetingMessage); 
        } catch (error) {
          console.error("Failed to get initial AI greeting:", error);
          const errMsg = "Hello! I had a little trouble starting up. Please try changing modes or refreshing.";
          
          addMessage(errMsg, 'ai'); 
          // Removed setIsSendingMessage(false) from here
          
          await speakTextRef.current(errMsg); 
        }
      };
      initGreeting();
    }
  }, [showSplashScreen, aiHasInitiatedConversation, personaTraits, isSendingMessage, isLoadingKnowledge, knowledgeFileSummaryHigh, dynamicKnowledgeContentHigh, addMessage]);

  const fetchAndProcessKnowledgeLevel = useCallback(async (
    levelPath: string,
    levelName: string,
    setSummary: React.Dispatch<React.SetStateAction<string>>,
    setContent: React.Dispatch<React.SetStateAction<string>>
  ): Promise<boolean> => {
    let levelCorsError = false;
    try {
      const kbMetaDocRef = doc(db, levelPath);
      const kbMetaDocSnap = await getDoc(kbMetaDocRef);
      let sources: PageKnowledgeSource[] = [];
      if (kbMetaDocSnap.exists() && kbMetaDocSnap.data()?.sources) {
        sources = kbMetaDocSnap.data().sources as PageKnowledgeSource[];
      }

      if (sources.length > 0) {
        const summary = `The ${levelName.toLowerCase()} priority knowledge base includes: ` +
                        sources.map(s => `${s.name} (Type: ${s.type})`).join(', ') + ".";
        setSummary(summary);

        const textFileContents: string[] = [];
        for (const source of sources) {
          if (source.type === 'text' && source.downloadURL && typeof source.downloadURL === 'string' && source.downloadURL.trim() !== '') {
            try {
              const response = await fetch(source.downloadURL);
              if (response.ok) {
                const textContent = await response.text();
                textFileContents.push(`Content from ${source.name} (${levelName} Priority):\n${textContent}\n---`);
              } else {
                levelCorsError = true;
                console.warn(`[HomePage] Failed to fetch ${source.name} (${levelName}) from ${source.downloadURL}. Status: ${response.status}. Likely CORS. Details in Network tab.`);
              }
            } catch (fetchError: any) {
              levelCorsError = true;
              console.error(`[HomePage] Fetch error for ${source.name} (${levelName}). URL: ${source.downloadURL}. Error: ${fetchError.message}. Likely CORS.`, fetchError);
            }
          } else if (source.type === 'text' && (!source.downloadURL || typeof source.downloadURL !== 'string' || source.downloadURL.trim() === '')) {
            console.warn(`[HomePage] Invalid or missing downloadURL for text file: ${source.name} (${levelName}). URL: '${source.downloadURL}'. Skipping.`);
          }
        }
        setContent(textFileContents.join('\n\n'));
      } else {
        setSummary('');
        setContent('');
      }
    } catch (e: any) {
        console.error(`Error fetching ${levelName} KB metadata:`, e);
        setSummary('');
        setContent('');
        toast({ title: `Error Loading ${levelName} KB`, description: `Could not load ${levelName} knowledge.`, variant: "destructive"});
        levelCorsError = true;
    }
    return levelCorsError;
  }, [toast]);


  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoadingKnowledge(true);
      setCorsErrorEncountered(false);
      let anyCorsError = false;

      try {
        const apiKeysDocRef = doc(db, FIRESTORE_API_KEYS_PATH);
        const apiKeysDocSnap = await getDoc(apiKeysDocRef);
        if (apiKeysDocSnap.exists()) {
          const keys = apiKeysDocSnap.data();
          setElevenLabsApiKey(keys.tts || null);
          setElevenLabsVoiceId(keys.voiceId || null);
        }

        const siteAssetsDocRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
        const siteAssetsDocSnap = await getDoc(siteAssetsDocRef);
        if (siteAssetsDocSnap.exists()) {
          const assets = siteAssetsDocSnap.data();
          setAvatarSrc(assets.avatarUrl || DEFAULT_AVATAR_PLACEHOLDER_URL);
          setSplashImageSrc(assets.splashImageUrl || DEFAULT_SPLASH_IMAGE_SRC);
          setPersonaTraits(assets.personaTraits || DEFAULT_PERSONA_TRAITS);
          setSplashScreenWelcomeMessage(assets.splashWelcomeMessage || DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE);
        } else {
          setAvatarSrc(DEFAULT_AVATAR_PLACEHOLDER_URL);
          setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC);
          setPersonaTraits(DEFAULT_PERSONA_TRAITS);
          setSplashScreenWelcomeMessage(DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE);
        }
      } catch (e) {
        console.error("Error fetching common config data:", e);
        toast({ title: "Config Error", description: "Could not load app settings.", variant: "destructive"});
      }

      const highError = await fetchAndProcessKnowledgeLevel(FIRESTORE_KB_HIGH_PATH, 'High', setKnowledgeFileSummaryHigh, setDynamicKnowledgeContentHigh);
      if (highError) anyCorsError = true;
      const mediumError = await fetchAndProcessKnowledgeLevel(FIRESTORE_KB_MEDIUM_PATH, 'Medium', setKnowledgeFileSummaryMedium, setDynamicKnowledgeContentMedium);
      if (mediumError) anyCorsError = true;
      const lowError = await fetchAndProcessKnowledgeLevel(FIRESTORE_KB_LOW_PATH, 'Low', setKnowledgeFileSummaryLow, setDynamicKnowledgeContentLow);
      if (lowError) anyCorsError = true;

      if (anyCorsError) {
        setCorsErrorEncountered(true);
      }

      setIsLoadingKnowledge(false);
    };
    fetchAllData();
  }, [toast, fetchAndProcessKnowledgeLevel]);

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

  useEffect(() => {
    if (splashImageSrc !== DEFAULT_SPLASH_IMAGE_SRC) {
      setIsSplashImageLoaded(false);
    } else {
      setIsSplashImageLoaded(true);
    }
  }, [splashImageSrc]);

  useEffect(() => {
    const handleNavigateToSplash = () => {
      resetConversation();
      setShowSplashScreen(true);
    };
    window.addEventListener('navigateToSplashScreen', handleNavigateToSplash);
    return () => {
      window.removeEventListener('navigateToSplashScreen', handleNavigateToSplash);
    };
  }, [resetConversation]);


  const corsTroubleshootingAlert = corsErrorEncountered && !isLoadingKnowledge && (
      <Alert variant="destructive" className="my-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Critical: Knowledge Base Access Issue (CORS)</AlertTitle>
        <AlertDescription className="space-y-2 text-left">
          <p>AI Blair cannot access some text files from your Firebase Storage due to a <strong>CORS (Cross-Origin Resource Sharing) configuration error</strong>. This means your storage bucket is not allowing this application (origin) to fetch files.</p>

           <p className="font-semibold">If your DEPLOYED app version works but Firebase Studio DOES NOT:</p>
          <ul className="list-disc list-inside space-y-1 text-xs pl-4">
              <li>The issue is almost certainly with the Firebase Studio origin. Open your browser's developer console (F12, Console tab) while running in Studio. Find the CORS error message. It will state the <strong>exact "origin"</strong> that was blocked (e.g., <code>https://6000-firebase-studio-1749487647018.cluster-joak5ukfbnbyqspg4tewa33d24.cloudworkstation.dev</code>).</li>
              <li>Ensure this <strong>exact Firebase Studio origin</strong> is present in your <code>cors-config.json</code> file.</li>
              <li>Verify with <code>gsutil cors get gs://ai-blair-7fb8o.firebasestorage.app</code> that the active policy on the bucket includes this exact Studio origin.</li>
          </ul>

          <p className="font-semibold mt-2">General CORS Troubleshooting for Firebase Storage:</p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li>
              <strong>Identify ALL Your App's Origins:</strong>
              <ul className="list-disc list-inside ml-4">
                <li>Firebase Studio: In your Studio browser's developer console (F12, Console tab), find the CORS error. Copy the **exact "origin"** shown (e.g., <code>https://6000-firebase-studio-1749487647018.cluster-joak5ukfbnbyqspg4tewa33d24.cloudworkstation.dev</code>).</li>
                <li>Deployed App: e.g., <code>https://studio--ai-blair-7fb8o.us-central1.hosted.app</code> (or your custom domain).</li>
                <li>Local Development: e.g., <code>http://localhost:9002</code>, <code>http://localhost:3000</code>.</li>
              </ul>
            </li>
            <li>
              <strong>Create/Update <code>cors-config.json</code> file with this exact content (replace the Studio origin if yours is different):</strong>
              <pre className="mt-1 p-2 bg-muted text-xs rounded-md overflow-x-auto">
{`[
  {
    "origin": [
      "https://6000-firebase-studio-1749487647018.cluster-joak5ukfbnbyqspg4tewa33d24.cloudworkstation.dev",
      "https://studio--ai-blair-7fb8o.us-central1.hosted.app",
      "http://localhost:3000",
      "http://localhost:9002"
    ],
    "method": [
      "GET",
      "HEAD",
      "OPTIONS"
    ],
    "responseHeader": [
      "Content-Type",
      "Access-Control-Allow-Origin"
    ],
    "maxAgeSeconds": 3600
  }
]`}
              </pre>
            </li>
            <li>
              <strong>Identify Your GCS Bucket ID:</strong>
              In Firebase Console > Storage > Files tab, your bucket ID is displayed (e.g., <code>ai-blair-7fb8o.appspot.com</code> or <code>ai-blair-7fb8o.firebasestorage.app</code>). Use the one that works with \`gsutil\`. You previously confirmed <code>ai-blair-7fb8o.firebasestorage.app</code> was correct for \`gsutil\`.
            </li>
            <li>
              <strong>Use \`gsutil\` (Google Cloud SDK command-line):</strong>
              <ul className="list-disc list-inside ml-4">
                <li>Open terminal/shell with \`gsutil\` configured.</li>
                <li>Navigate to where \`cors-config.json\` is saved.</li>
                <li>
                  Set policy: <code>gsutil cors set cors-config.json gs://ai-blair-7fb8o.firebasestorage.app</code>
                </li>
                <li>
                  Verify: <code>gsutil cors get gs://ai-blair-7fb8o.firebasestorage.app</code>
                  <br />The output **MUST** match your \`cors-config.json\`. If not, the \`set\` command failed or used the wrong bucket ID.
                </li>
              </ul>
            </li>
            <li>
              <strong>Wait &amp; Test:</strong> Allow 5-10 min for settings to propagate. **Clear browser cache AND cookies thoroughly.** Test in a new Incognito/Private window.
            </li>
          </ol>
          <p className="mt-2">AI Blair's knowledge base functionality will be limited until this is resolved.</p>
        </AlertDescription>
      </Alert>
  );


  if (showSplashScreen) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-headline text-primary">{splashScreenWelcomeMessage}</CardTitle>
            <CardDescription>Let's have a conversation.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-6">
            <Image
              src={splashImageSrc}
              alt="AI Chat Splash"
              width={400}
              height={267}
              className={cn(
                "rounded-lg shadow-md object-cover transition-opacity duration-700 ease-in-out",
                (splashImageSrc !== DEFAULT_SPLASH_IMAGE_SRC && !isSplashImageLoaded) ? "opacity-0" : "opacity-100"
              )}
              priority
              unoptimized={splashImageSrc.startsWith('data:image/')}
              onLoad={() => { if (splashImageSrc !== DEFAULT_SPLASH_IMAGE_SRC) setIsSplashImageLoaded(true); }}
              onError={() => {
                setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC);
                setIsSplashImageLoaded(true);
              }}
              data-ai-hint={(splashImageSrc === DEFAULT_SPLASH_IMAGE_SRC || splashImageSrc.includes("placehold.co")) ? "technology abstract welcome" : undefined}
            />
            <p className="text-lg font-semibold text-foreground">Choose your preferred way to interact.</p>
             {isLoadingKnowledge && (
                <div className="flex items-center text-sm text-muted-foreground p-2 border rounded-md bg-secondary/30">
                    <DatabaseZap className="mr-2 h-5 w-5 animate-pulse" />
                    Connecting to knowledge bases...
                </div>
            )}
            <RadioGroup
              value={selectedInitialMode}
              onValueChange={(value: CommunicationMode) => setSelectedInitialMode(value)}
              className="w-full space-y-2"
            >
              <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="audio-only" id="r1" disabled={isLoadingKnowledge}/>
                <Label htmlFor="r1" className={cn("flex-grow cursor-pointer text-base", isLoadingKnowledge && "cursor-not-allowed opacity-50")}>Audio Only</Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="audio-text" id="r2" disabled={isLoadingKnowledge}/>
                <Label htmlFor="r2" className={cn("flex-grow cursor-pointer text-base", isLoadingKnowledge && "cursor-not-allowed opacity-50")}>Audio &amp; Text (Recommended)</Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="text-only" id="r3" disabled={isLoadingKnowledge}/>
                <Label htmlFor="r3" className={cn("flex-grow cursor-pointer text-base", isLoadingKnowledge && "cursor-not-allowed opacity-50")}>Text Only</Label>
              </div>
            </RadioGroup>
            <Button onClick={handleModeSelectionSubmit} size="lg" className="w-full" disabled={isLoadingKnowledge}>
              <CheckCircle className="mr-2"/>
              {isLoadingKnowledge ? "Loading..." : "Start Chatting"}
            </Button>
             {!isLoadingKnowledge && elevenLabsApiKey === null && (
                <div className="flex items-start text-xs text-destructive/80 p-2 border border-destructive/30 rounded-md mt-2">
                    <AlertTriangle className="h-4 w-4 mr-1.5 mt-0.5 shrink-0" />
                    <span>Voice features (ElevenLabs TTS) may be limited. API key not configured. Using browser default TTS.</span>
                </div>
            )}
            {corsTroubleshootingAlert}
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
    unoptimized: avatarSrc.startsWith('data:image/') || avatarSrc.startsWith('blob:') || !avatarSrc.startsWith('https://'),
    onError: () => {
      console.warn("Custom avatar failed to load on main page, falling back.");
      setAvatarSrc(DEFAULT_AVATAR_PLACEHOLDER_URL);
    }
  };

  if (avatarSrc === DEFAULT_AVATAR_PLACEHOLDER_URL || avatarSrc.includes("placehold.co")) {
    (imageProps as any)['data-ai-hint'] = "professional woman";
  }


  const showPreparingGreeting = !aiHasInitiatedConversation && isSendingMessage && messagesRef.current.length === 0;

  const showSpeakButtonAudioOnly =
      communicationMode === 'audio-only' &&
      aiHasInitiatedConversation &&
      !isListening &&
      !isSendingMessage &&
      !isSpeaking &&
      !showSaveDialog &&
      !showPreparingAudioResponseIndicator &&
      !(messagesRef.current.length === 1 && messagesRef.current[0]?.sender === 'ai' && aiHasInitiatedConversation);


  const mainContent = () => {
    if (isLoadingKnowledge) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <DatabaseZap className="h-16 w-16 text-primary mb-6 animate-pulse" />
                <h2 className="mt-6 text-3xl font-bold font-headline text-primary">Loading Knowledge Bases</h2>
                <p className="mt-2 text-muted-foreground">Please wait while AI Blair gathers the latest information...</p>
            </div>
        );
    }

    if (communicationMode === 'audio-only') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center py-8">
          {corsTroubleshootingAlert}
          <Image {...imageProps} />
          <h2 className="mt-6 text-3xl font-bold font-headline text-primary">Ask blAIr</h2>

          <div className="mt-4 flex h-12 w-full items-center justify-center">
            {showPreparingGreeting ? (
              <div className="flex items-center justify-center rounded-lg bg-secondary p-3 text-secondary-foreground shadow animate-pulse">
                Preparing greeting...
              </div>
            ) : isListening ? (
              <div className="flex items-center justify-center rounded-lg bg-accent p-3 text-accent-foreground shadow animate-pulse">
                <Mic size={20} className="mr-2" /> Listening...
              </div>
            ) : showPreparingAudioResponseIndicator && !isSpeaking && !isListening ? (
              <div className="flex items-center justify-center rounded-lg bg-secondary p-3 text-secondary-foreground shadow animate-pulse">
                <Loader2 size={20} className="mr-2 animate-spin" /> Preparing
                response...
              </div>
            ) : null }
          </div>

          {(messagesRef.current.length > 0 && showLogForSaveConfirmation) && (
            <div className="w-full max-w-md mt-6">
                 <ConversationLog messages={messagesRef.current} isLoadingAiResponse={false} avatarSrc={avatarSrc} />
            </div>
          )}

          {showSpeakButtonAudioOnly && (
             <Button onClick={() => toggleListeningRef.current(true)} variant="outline" size="lg" className="mt-6">
                <Mic size={24} className="mr-2"/> Speak
            </Button>
          )}
          {aiHasInitiatedConversation && !showSaveDialog && (
            <Button
              onClick={handleEndChatManually}
              variant="default"
              size="default"
              className="mt-8"
              disabled={isSpeaking}
            >
              <Power className="mr-2 h-5 w-5" /> End Chat
            </Button>
          )}
           <AlertDialog open={showSaveDialog} onOpenChange={(open) => {
             if (!open) {
                handleCloseSaveDialog(false);
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
              <h2 className="mt-4 text-2xl font-bold text-center font-headline text-primary">Ask blAIr</h2>
              {showPreparingGreeting && (
                <p className="mt-2 text-center text-base font-semibold text-muted-foreground animate-pulse">
                  Preparing greeting...
                </p>
              )}
            </CardContent>
          </Card>
           {corsTroubleshootingAlert}
        </div>
        <div className="md:col-span-2 flex flex-col h-full">
          <ConversationLog messages={messagesRef.current} isLoadingAiResponse={isSendingMessage && aiHasInitiatedConversation} avatarSrc={avatarSrc} />
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
    </div>
  );
}

