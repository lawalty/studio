
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ConversationLog from '@/components/chat/ConversationLog';
import MessageInput from '@/components/chat/MessageInput';
import { generateChatResponse, type GenerateChatResponseInput, type GenerateChatResponseOutput } from '@/ai/flows/generate-chat-response';
import { generateInitialGreeting, type GenerateInitialGreetingInput } from '@/ai/flows/generate-initial-greeting';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from '@/components/ui/label';
import { Mic, Square as SquareIcon, CheckCircle, Power, DatabaseZap, AlertTriangle, Info, Loader2, Save, RotateCcw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { KnowledgeSource } from '@/app/admin/knowledge-base/page';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';


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
const DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL = "https://placehold.co/150x150.png?text=GIF";
const DEFAULT_PERSONA_TRAITS = "You are AI Blair, a knowledgeable and helpful assistant specializing in the pawn store industry. You are professional, articulate, and provide clear, concise answers based on your knowledge base. Your tone is engaging and conversational.";
const DEFAULT_SPLASH_IMAGE_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE = "Welcome to AI Chat";
const DEFAULT_CUSTOM_GREETING_MAIN_PAGE = "";
const DEFAULT_USER_SPEECH_PAUSE_TIME_MS = 750;
const DEFAULT_TEXT_ANIMATION_ENABLED = false;
const DEFAULT_TEXT_ANIMATION_SPEED_MS = 800;


const FIRESTORE_API_KEYS_PATH = "configurations/api_keys_config";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";

const FIRESTORE_KB_HIGH_PATH = "configurations/kb_high_meta_v1";
const FIRESTORE_KB_MEDIUM_PATH = "configurations/kb_medium_meta_v1";
const FIRESTORE_KB_LOW_PATH = "configurations/kb_low_meta_v1";


export type CommunicationMode = 'audio-text' | 'text-only' | 'audio-only';

const SpeechRecognitionAPI = (typeof window !== 'undefined') ? window.SpeechRecognition || (window as any).webkitSpeechRecognition : null;
const MAX_SILENCE_PROMPTS_AUDIO_ONLY = 2;


const getUserNameFromHistory = (history: Message[]): string | null => {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (message.sender === 'user') {
      const text = message.text;
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
  const [animatedAvatarSrc, setAnimatedAvatarSrc] = useState<string>(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL);
  const [personaTraits, setPersonaTraits] = useState<string>(DEFAULT_PERSONA_TRAITS);
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState<string | null>(null);
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState<string | null>(null);
  const [useTtsApi, setUseTtsApi] = useState<boolean>(true);
  const [useKnowledgeInGreeting, setUseKnowledgeInGreeting] = useState<boolean>(true);
  const [customGreeting, setCustomGreeting] = useState<string>(DEFAULT_CUSTOM_GREETING_MAIN_PAGE);
  const [responsePauseTimeMs, setResponsePauseTimeMs] = useState<number>(DEFAULT_USER_SPEECH_PAUSE_TIME_MS);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [communicationMode, setCommunicationMode] = useState<CommunicationMode>('audio-text');
  const [aiHasInitiatedConversation, setAiHasInitiatedConversation] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [consecutiveSilencePrompts, setConsecutiveSilencePrompts] = useState(0);
  const [hasConversationEnded, setHasConversationEnded] = useState(false);
  const [showPreparingGreeting, setShowPreparingGreeting] = useState(false);
  const [textAnimationEnabled, setTextAnimationEnabled] = useState<boolean>(DEFAULT_TEXT_ANIMATION_ENABLED);
  const [textAnimationSpeedMs, setTextAnimationSpeedMs] = useState<number>(DEFAULT_TEXT_ANIMATION_SPEED_MS);


  const [knowledgeFileSummaryHigh, setKnowledgeFileSummaryHigh] = useState<string>('');
  const [knowledgeFileSummaryMedium, setKnowledgeFileSummaryMedium] = useState<string>('');
  const [knowledgeFileSummaryLow, setKnowledgeFileSummaryLow] = useState<string>('');
  const [dynamicKnowledgeContentHigh, setDynamicKnowledgeContentHigh] = useState<string>('');
  const [dynamicKnowledgeContentMedium, setDynamicKnowledgeContentMedium] = useState<string>('');
  const [dynamicKnowledgeContentLow, setDynamicKnowledgeContentLow] = useState<string>('');

  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(true);
  const [corsErrorEncountered, setCorsErrorEncountered] = useState(false);


  const elevenLabsAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast, dismiss: dismissAllToasts } = useToast();

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

  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const accumulatedTranscriptRef = useRef<string>('');
  const sendTranscriptTimerRef = useRef<NodeJS.Timeout | null>(null);


  useEffect(() => {
    if (typeof window !== 'undefined') {
        if (showSplashScreen) {
            window.dispatchEvent(new CustomEvent('splashScreenActive'));
        } else {
            window.dispatchEvent(new CustomEvent('splashScreenInactive'));
        }
    }
  }, [showSplashScreen]);

  useEffect(() => {
    const sendInitialState = () => {
        if (showSplashScreen) window.dispatchEvent(new CustomEvent('splashScreenActive'));
        else window.dispatchEvent(new CustomEvent('splashScreenInactive'));
    };
    window.addEventListener('requestInitialSplashState', sendInitialState);
    sendInitialState();
    return () => window.removeEventListener('requestInitialSplashState', sendInitialState);
  }, [showSplashScreen]);


  const addMessage = useCallback((text: string, sender: 'user' | 'ai') => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: Date.now().toString() + Math.random(), text, sender: sender, timestamp: Date.now() },
    ]);
  }, []);

  const resetConversation = useCallback(() => {
    dismissAllToasts();
    setMessages([]);
    setIsSendingMessage(false);
    setAiHasInitiatedConversation(false);
    setInputValue('');
    accumulatedTranscriptRef.current = '';
    setConsecutiveSilencePrompts(0);
    isEndingSessionRef.current = false;
    isAboutToSpeakForSilenceRef.current = false;
    setHasConversationEnded(false);
    setShowPreparingGreeting(false);


    if (sendTranscriptTimerRef.current) {
      clearTimeout(sendTranscriptTimerRef.current);
      sendTranscriptTimerRef.current = null;
    }

    if (isListeningRef.current && recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch(e) { /* ignore */ }
    }
    setIsListening(false);

    if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
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
    setIsSpeaking(false);
  }, [dismissAllToasts]);


 const toggleListening = useCallback((forceState?: boolean) => {
    if (!recognitionRef.current && (communicationModeRef.current === 'audio-only' || communicationModeRef.current === 'audio-text')) {
      toast({ title: "Mic Not Ready", description: "Speech recognition not available. Try refreshing.", variant: "destructive" });
      return;
    }

    const targetIsListeningState = typeof forceState === 'boolean' ? forceState : !isListeningRef.current;

    if (targetIsListeningState === true) {
      if (hasConversationEnded) { setIsListening(false); return; }
      if (communicationModeRef.current === 'text-only') { setIsListening(false); return; }

      if (typeof forceState === 'undefined') { 
         if (isSpeakingRef.current) {
            toast({ title: "AI Speaking", description: "Please wait for AI Blair to finish speaking.", variant: "default"});
            setIsListening(false); return;
         }
         if (isSendingMessage) {
            toast({ title: "Processing", description: "Please wait for the current message to process.", variant: "default"});
            setIsListening(false); return;
         }
      }
      
      if (sendTranscriptTimerRef.current) {
        clearTimeout(sendTranscriptTimerRef.current);
        sendTranscriptTimerRef.current = null;
      }
      
      accumulatedTranscriptRef.current = ''; 
      setInputValue(''); 
      
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (startError: any) {
        if (startError.name !== 'InvalidStateError' && startError.name !== 'AbortError') { 
          toast({ variant: 'destructive', title: 'Microphone Start Error', description: `${startError.name}: ${startError.message || 'Could not start microphone.'}` });
        }
        setIsListening(false); 
      }
    } else { 
      if (recognitionRef.current) {
         try { recognitionRef.current.stop(); } catch(e) { /* ignore - might already be stopped */ }
      } else {
        setIsListening(false); 
      }

      if (sendTranscriptTimerRef.current) {
        clearTimeout(sendTranscriptTimerRef.current);
        sendTranscriptTimerRef.current = null;
      }
      
      if (typeof forceState === 'undefined') { 
        const textToSendFromStop = (communicationModeRef.current === 'audio-only') 
            ? accumulatedTranscriptRef.current.trim() 
            : inputValueRef.current.trim(); 

        if (textToSendFromStop !== '') {
            handleSendMessageRef.current(textToSendFromStop, 'voice');
        }
      }
    }
  }, [toast, hasConversationEnded, isSendingMessage]);

  const toggleListeningRef = useRef(toggleListening);
  useEffect(() => {
    toggleListeningRef.current = toggleListening;
  }, [toggleListening]);


  const handleActualAudioStart = useCallback(() => {
    setIsSpeaking(true);
    isAboutToSpeakForSilenceRef.current = false; 
    setShowPreparingGreeting(false); 
    if (isListeningRef.current && recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {/*ignore*/}
    }
  }, []);

  const handleAudioProcessEnd = useCallback(() => {
    const wasSpeakingBeforeEnd = isSpeakingRef.current;
    setIsSpeaking(false);
    setShowPreparingGreeting(false); 

    if (elevenLabsAudioRef.current) {
        if (elevenLabsAudioRef.current.src && elevenLabsAudioRef.current.src.startsWith('blob:')) {
            URL.revokeObjectURL(elevenLabsAudioRef.current.src);
        }
        elevenLabsAudioRef.current.src = '';
        elevenLabsAudioRef.current.onplay = null;
        elevenLabsAudioRef.current.onended = null;
        elevenLabsAudioRef.current.onerror = null;
    }

    if (isEndingSessionRef.current && wasSpeakingBeforeEnd) {
        setHasConversationEnded(true); 
        return; 
    }

    if (communicationModeRef.current === 'audio-only' && !isEndingSessionRef.current && !hasConversationEnded) {
        toggleListeningRef.current(true); 
    } else if (communicationModeRef.current === 'audio-text' && !isEndingSessionRef.current && !hasConversationEnded) {
    }
  }, [hasConversationEnded]);


 const browserSpeakInternal = useCallback((textForSpeech: string, onSpeechStartCallback?: () => void) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(textForSpeech);
      utterance.pitch = 1;
      utterance.rate = 1;

      const voices = window.speechSynthesis.getVoices();
      let selectedVoice = voices.find(voice => voice.lang === 'en-US' && (voice.name.toLowerCase().includes('male') || voice.name.toLowerCase().includes('david') || voice.name.toLowerCase().includes('mark') || voice.name.toLowerCase().includes('microsoft david') || voice.name.toLowerCase().includes('google us english male'))) ||
                         voices.find(voice => voice.lang.startsWith('en-') && (voice.name.toLowerCase().includes('male'))) ||
                         voices.find(voice => voice.lang === 'en-US');
      if (selectedVoice) utterance.voice = selectedVoice;

      utterance.onstart = () => {
        onSpeechStartCallback?.(); 
        handleActualAudioStart(); 
      };
      utterance.onend = handleAudioProcessEnd;
      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        if (event.error !== 'interrupted' && event.error !== 'aborted' && event.error !== 'canceled') {
          console.error("Browser TTS Error:", event.error, event);
        }
        handleAudioProcessEnd();
      };
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn("Browser TTS Not Supported.");
      onSpeechStartCallback?.(); 
      handleAudioProcessEnd();
    }
  }, [handleActualAudioStart, handleAudioProcessEnd]);

 const speakText = useCallback(async (text: string, onSpeechStartCallback?: () => void) => {
    const textForSpeech = text.replace(/EZCORP/gi, "easy corp");

    if (communicationModeRef.current === 'text-only' || textForSpeech.trim() === "" || (hasConversationEnded && !isEndingSessionRef.current)) {
      onSpeechStartCallback?.();
      setIsSpeaking(false);
      setShowPreparingGreeting(false);
      if (isEndingSessionRef.current && (communicationModeRef.current === 'text-only' || hasConversationEnded)) {
         setHasConversationEnded(true);
      }
      return;
    }

    if (isListeningRef.current && recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch(e) {/* ignore */}
    }
    if (sendTranscriptTimerRef.current) {
      clearTimeout(sendTranscriptTimerRef.current);
    }

    if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
    if (elevenLabsAudioRef.current && elevenLabsAudioRef.current.src && !elevenLabsAudioRef.current.paused) {
       elevenLabsAudioRef.current.pause();
       if (elevenLabsAudioRef.current.src.startsWith('blob:')) URL.revokeObjectURL(elevenLabsAudioRef.current.src);
       elevenLabsAudioRef.current.src = '';
    }
    setIsSpeaking(false); 
    if (messagesRef.current.length <= 1 && messagesRef.current.find(m=>m.sender==='ai')) {
        setShowPreparingGreeting(true);
    }


    if (useTtsApi && elevenLabsApiKey && elevenLabsVoiceId) {
      const ttsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`;
      const headers = { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': elevenLabsApiKey };
      const body = JSON.stringify({ text: textForSpeech, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true }});

      try {
        const response = await fetch(ttsUrl, { method: "POST", headers, body });
        if (response.ok) {
          const audioBlob = await response.blob();
          if (audioBlob.size === 0 || !audioBlob.type.startsWith('audio/')) {
            toast({ title: "TTS Audio Issue", description: "Received invalid audio data. Using browser TTS.", variant: "default" });
            browserSpeakInternal(textForSpeech, onSpeechStartCallback); return;
          }
          const audioUrl = URL.createObjectURL(audioBlob);
          if (!elevenLabsAudioRef.current) elevenLabsAudioRef.current = new Audio();
          const audio = elevenLabsAudioRef.current;
          audio.src = audioUrl;
          audio.onplay = () => { 
            onSpeechStartCallback?.(); 
            handleActualAudioStart(); 
          };
          audio.onended = handleAudioProcessEnd;
          audio.onerror = (e: Event | string) => {
            const mediaError = e instanceof Event ? (e.target as HTMLAudioElement)?.error : null;
            const errorMessage = typeof e === 'string' ? e : (mediaError?.message || 'Unknown audio error');
            if (mediaError?.code === mediaError?.MEDIA_ERR_ABORTED || errorMessage.includes("interrupted") || errorMessage.includes("The play() request was interrupted")) {
                 // Benign interruption, likely due to new speech starting or programmatic stop.
            } else if (mediaError?.code === mediaError?.MEDIA_ERR_SRC_NOT_SUPPORTED || (errorMessage && errorMessage.toLowerCase().includes("empty src attribute"))){
                 console.warn("ElevenLabs Audio Playback Warning (SRC Issue):", errorMessage, mediaError);
                 toast({ title: "TTS Playback Issue", description: "Using browser default due to audio source problem.", variant: "default" });
            }
            else {
                console.error("ElevenLabs Audio Playback Error:", errorMessage, mediaError);
                toast({ title: "TTS Playback Error", description: "Using browser default.", variant: "destructive" });
            }
            browserSpeakInternal(textForSpeech, onSpeechStartCallback); 
          };
          try { 
            await audio.play(); 
          } catch (playError: any) {
            if (playError.name === 'AbortError' || playError.message.includes("interrupted")) { /* Already handled or benign */ }
            else {
                console.error("ElevenLabs Audio Play Error:", playError);
                toast({ title: "TTS Play Error", description: "Using browser default.", variant: "destructive" });
            }
            browserSpeakInternal(textForSpeech, onSpeechStartCallback); 
            return; 
          }
          return;
        } else {
          const errorBody = await response.text();
          toast({ title: `TTS API Error (${response.status})`, description: `ElevenLabs: ${errorBody.substring(0,100)}. Using browser default.`, variant: "destructive", duration: 8000 });
        }
      } catch (error: any) {
         toast({ title: "TTS Connection Error", description: `Could not connect to ElevenLabs: ${error.message || 'Unknown'}. Using browser default.`, variant: "destructive", duration: 8000 });
         if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) setCorsErrorEncountered(true);
      }
    }
    browserSpeakInternal(textForSpeech, onSpeechStartCallback);
  }, [
      useTtsApi, elevenLabsApiKey, elevenLabsVoiceId, toast, browserSpeakInternal,
      handleActualAudioStart, handleAudioProcessEnd, hasConversationEnded
    ]);

  const speakTextRef = useRef(speakText);
  useEffect(() => {
    speakTextRef.current = speakText;
  }, [speakText]);

  const handleSendMessage = useCallback(async (text: string, method: 'text' | 'voice') => {
    if (text.trim() === '' || hasConversationEnded || isSendingMessage) return;

    if (isListeningRef.current && recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch(e) {/* ignore */}
    }
     if (sendTranscriptTimerRef.current) {
      clearTimeout(sendTranscriptTimerRef.current);
      sendTranscriptTimerRef.current = null;
    }
    
    addMessage(text, 'user');
    setInputValue('');
    accumulatedTranscriptRef.current = ''; 

    setIsSendingMessage(true);
    setConsecutiveSilencePrompts(0);
    isAboutToSpeakForSilenceRef.current = false;


    const historyForGenkit = messagesRef.current 
        .filter(msg => !(msg.text === text && msg.sender === 'user' && msg.id === messagesRef.current[messagesRef.current.length -1]?.id)) 
        .map(msg => ({ role: msg.sender === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] }));

    const combinedLowPriorityText = [MOCK_KNOWLEDGE_BASE_CONTENT, dynamicKnowledgeContentLow].filter(Boolean).join('\n\n');

    try {
      const flowInput: GenerateChatResponseInput = {
        userMessage: text,
        knowledgeBaseHigh: { summary: knowledgeFileSummaryHigh || undefined, textContent: dynamicKnowledgeContentHigh || undefined },
        knowledgeBaseMedium: { summary: knowledgeFileSummaryMedium || undefined, textContent: dynamicKnowledgeContentMedium || undefined },
        knowledgeBaseLow: { summary: knowledgeFileSummaryLow || undefined, textContent: combinedLowPriorityText || undefined },
        personaTraits: personaTraits, chatHistory: historyForGenkit,
      };

      const result: GenerateChatResponseOutput = await generateChatResponse(flowInput);
      
      const onSpeechActuallyStarting = () => {
        setTimeout(() => {
          if (!isEndingSessionRef.current || (isEndingSessionRef.current && result.shouldEndConversation)) {
            addMessage(result.aiResponse, 'ai');
          }
          setIsSendingMessage(false); 
        }, 50);
      };

      if (result.shouldEndConversation) {
        isEndingSessionRef.current = true;
      }
      await speakTextRef.current(result.aiResponse, onSpeechActuallyStarting);

    } catch (error) {
      console.error("Error in generateChatResponse or speakText:", error);
      const errorMessage = "Sorry, I encountered an error. Please try again.";
      
      if (!isEndingSessionRef.current) {
        addMessage(errorMessage, 'ai');
        setIsSendingMessage(false); 

        if (communicationModeRef.current !== 'text-only') {
          await speakTextRef.current(errorMessage); 
        }
      } else {
        setHasConversationEnded(true);
        setIsSendingMessage(false);
      }
    }

  }, [addMessage, personaTraits, hasConversationEnded, isSendingMessage, setInputValue,
      knowledgeFileSummaryHigh, dynamicKnowledgeContentHigh,
      knowledgeFileSummaryMedium, dynamicKnowledgeContentMedium,
      knowledgeFileSummaryLow, dynamicKnowledgeContentLow
    ]);

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
    recognition.continuous = communicationModeRef.current === 'audio-text'; 
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (isSpeakingRef.current || isSendingMessage) {
        if(recognitionRef.current && isListeningRef.current) try { recognitionRef.current.abort(); } catch(e){}
        return;
      }
      
      let currentVisualTranscript = '';
      let latestFinalUtteranceThisEvent = '';

      for (let i = 0; i < event.results.length; i++) {
        const segmentTranscript = event.results[i][0].transcript;
        if (communicationModeRef.current === 'audio-text') {
            currentVisualTranscript += segmentTranscript;
        }
        if (event.results[i].isFinal) {
            latestFinalUtteranceThisEvent = segmentTranscript.trim(); 
        }
      }
      
      if (communicationModeRef.current === 'audio-text') {
        setInputValue(currentVisualTranscript.trimStart()); 
        if (latestFinalUtteranceThisEvent && latestFinalUtteranceThisEvent !== accumulatedTranscriptRef.current) {
             accumulatedTranscriptRef.current = latestFinalUtteranceThisEvent;
             setConsecutiveSilencePrompts(0); 
             if (sendTranscriptTimerRef.current) clearTimeout(sendTranscriptTimerRef.current);
             sendTranscriptTimerRef.current = setTimeout(() => {
               if (isListeningRef.current && accumulatedTranscriptRef.current.trim() !== '') {
                   handleSendMessageRef.current(accumulatedTranscriptRef.current.trim(), 'voice');
               }
               sendTranscriptTimerRef.current = null;
             }, responsePauseTimeMs);
          }
      } else { 
         if (latestFinalUtteranceThisEvent) {
            accumulatedTranscriptRef.current = latestFinalUtteranceThisEvent;
            setConsecutiveSilencePrompts(0);
          }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false); 
      if (sendTranscriptTimerRef.current) {
        clearTimeout(sendTranscriptTimerRef.current);
        sendTranscriptTimerRef.current = null;
      }

      if (event.error === 'aborted' || event.error === 'interrupted' || event.error === 'canceled') { /* Programmatic stops or expected interruptions */ }
      else if (event.error === 'no-speech') { /* Handled by onend for audio-only's silence prompts */ }
      else if (event.error === 'audio-capture') {
        toast({ title: "Microphone Issue", description: "No audio detected. Check mic & permissions.", variant: "destructive" });
      } else if (event.error !== 'network') { 
        toast({ title: "Microphone Error", description: `Mic error: ${event.error}. Please check permissions.`, variant: "destructive" });
      }
    };

    recognition.onend = () => {
      const wasListeningWhenRecognitionEnded = isListeningRef.current;
      setIsListening(false); 

      if (isSpeakingRef.current || isSendingMessage || hasConversationEnded || isEndingSessionRef.current || isAboutToSpeakForSilenceRef.current || sendTranscriptTimerRef.current) {
        return; 
      }
      
      const transcriptToSend = accumulatedTranscriptRef.current.trim();
      
      if (transcriptToSend !== '' && wasListeningWhenRecognitionEnded) { 
        handleSendMessageRef.current(transcriptToSend, 'voice');
      } else if (transcriptToSend === '' && wasListeningWhenRecognitionEnded && communicationModeRef.current === 'audio-only') {
        isAboutToSpeakForSilenceRef.current = true; 
        setConsecutiveSilencePrompts(currentPrompts => {
          const newPromptCount = currentPrompts + 1;
          if (newPromptCount >= MAX_SILENCE_PROMPTS_AUDIO_ONLY) {
            isEndingSessionRef.current = true;
            const endMsg = "It looks like you might have stepped away. Let's end this chat.";
            if (!messagesRef.current.find(m => m.text === endMsg && m.sender === 'ai')) { 
                addMessage(endMsg, 'ai');
            }
            speakTextRef.current(endMsg); 
          } else {
            const userName = getUserNameFromHistory(messagesRef.current);
            const promptMessage = userName ? `${userName}, are you still there?` : "Hello? Is someone there?";
            speakTextRef.current(promptMessage); 
          }
          return newPromptCount;
        });
      } else if (communicationModeRef.current === 'audio-only' && !hasConversationEnded && !isEndingSessionRef.current && !isAboutToSpeakForSilenceRef.current) {
         toggleListeningRef.current(true);
      }
    };
    return recognition;
  }, [toast, responsePauseTimeMs, addMessage, communicationMode]); 

  useEffect(() => {
    if (typeof window !== 'undefined' && SpeechRecognitionAPI) {
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e) {} 
        }
        const rec = initializeSpeechRecognition();
        recognitionRef.current = rec;
    }
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch(e) {}
        recognitionRef.current = null;
      }
      if (sendTranscriptTimerRef.current) {
        clearTimeout(sendTranscriptTimerRef.current);
        sendTranscriptTimerRef.current = null;
      }
    };
  }, [initializeSpeechRecognition, communicationMode]); 


  const handleModeSelectionSubmit = () => {
    resetConversation();
    setCommunicationMode(selectedInitialMode); 
    setShowSplashScreen(false);
  };

  const handleEndChatManually = () => {
    isEndingSessionRef.current = true;
    isAboutToSpeakForSilenceRef.current = false;
    setShowPreparingGreeting(false);
    setIsSendingMessage(false); 

    if (sendTranscriptTimerRef.current) {
      clearTimeout(sendTranscriptTimerRef.current);
      sendTranscriptTimerRef.current = null;
    }
    accumulatedTranscriptRef.current = '';
    setInputValue('');


    if (isListeningRef.current && recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch(e) { /* ignore */ }
    }
    setIsListening(false);

    if (isSpeakingRef.current) {
        if (elevenLabsAudioRef.current && elevenLabsAudioRef.current.src && !elevenLabsAudioRef.current.paused) {
            elevenLabsAudioRef.current.pause();
            if (elevenLabsAudioRef.current.src.startsWith('blob:')) URL.revokeObjectURL(elevenLabsAudioRef.current.src);
            elevenLabsAudioRef.current.src = '';
        }
        if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        setIsSpeaking(false); 
        setHasConversationEnded(true); 
    } else {
        setHasConversationEnded(true); 
    }
  };

  const handleSaveConversationAsPdf = async () => {
    const conversationLogElement = document.querySelector('[data-testid="conversation-log-viewport"]');
    if (!(conversationLogElement instanceof HTMLElement)) {
      toast({
        title: "Error",
        description: "Could not find conversation log to export.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Generating PDF...",
      description: "This may take a moment for long conversations.",
    });

    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(conversationLogElement, {
        scale: 2, 
        useCORS: true, 
        backgroundColor: '#FFFFFF', 
        height: conversationLogElement.scrollHeight, 
        windowHeight: conversationLogElement.scrollHeight 
      });

      if (canvas.width === 0 || canvas.height === 0) {
         toast({ title: "Canvas Error", description: "Captured canvas is empty or has zero dimensions. PDF cannot be generated.", variant: "destructive" });
         return;
      }

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt', 
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const pageMargin = 20; 
      const contentWidth = pdfWidth - (pageMargin * 2);

      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * contentWidth) / imgProps.width;
      let heightLeft = imgHeight;
      let position = pageMargin; 

      pdf.addImage(imgData, 'PNG', pageMargin, position, contentWidth, imgHeight);
      heightLeft -= (pdfHeight - (pageMargin * 2)); 

      while (heightLeft > 0) {
        position = position - (pdfHeight - (pageMargin * 2)); 
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', pageMargin, position, contentWidth, imgHeight);
        heightLeft -= (pdfHeight - (pageMargin * 2));
      }

      pdf.save('AI-Blair-Conversation.pdf');
      toast({
        title: "PDF Generated",
        description: "Your conversation has been saved.",
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "PDF Generation Failed",
        description: "Could not save the conversation as PDF. See console for details.",
        variant: "destructive",
      });
    }
  };


  const handleStartNewChat = () => {
    resetConversation();
    setAiHasInitiatedConversation(false); 
  };


  useEffect(() => {
    if (!showSplashScreen && !aiHasInitiatedConversation && personaTraits && messages.length === 0 && !isSpeakingRef.current && !isSendingMessage && !isLoadingKnowledge && !hasConversationEnded) {
      setAiHasInitiatedConversation(true); 
      isAboutToSpeakForSilenceRef.current = false; 

      const initConversation = async () => {
        let greetingToUse: string | null = null;
        if (customGreeting && customGreeting.trim() !== "") {
          greetingToUse = customGreeting.trim();
        } else {
          try {
            const greetingInput: GenerateInitialGreetingInput = {
              personaTraits,
              knowledgeBaseHighSummary: knowledgeFileSummaryHigh || undefined,
              knowledgeBaseHighTextContent: dynamicKnowledgeContentHigh || undefined,
              useKnowledgeInGreeting: useKnowledgeInGreeting,
            };
            setShowPreparingGreeting(true); 
            const result = await generateInitialGreeting(greetingInput);
            greetingToUse = result.greetingMessage;
          } catch (error) {
            console.error("Error generating initial greeting:", error);
            greetingToUse = "Hello! I had a little trouble starting up. Please try changing modes or refreshing.";
          }
        }

        if (greetingToUse) {
          const onGreetingSpeechActuallyStarting = () => {
            setTimeout(() => { 
                 if (!isEndingSessionRef.current) { 
                    addMessage(greetingToUse!, 'ai');
                 }
            }, 50); 
          };
          await speakTextRef.current(greetingToUse, onGreetingSpeechActuallyStarting);
        } else {
             setShowPreparingGreeting(false);
             if (communicationModeRef.current === 'audio-only' && !isEndingSessionRef.current && !hasConversationEnded) {
                toggleListeningRef.current(true); 
            }
        }
      };
      initConversation();
    }
  }, [
      showSplashScreen, aiHasInitiatedConversation, personaTraits, messages, isSendingMessage, isLoadingKnowledge, hasConversationEnded,
      knowledgeFileSummaryHigh, dynamicKnowledgeContentHigh, useKnowledgeInGreeting, customGreeting, addMessage
    ]);

  const fetchAndProcessKnowledgeLevel = useCallback(async (
    levelPath: string, levelName: string,
    setSummary: React.Dispatch<React.SetStateAction<string>>,
    setContent: React.Dispatch<React.SetStateAction<string>>
  ): Promise<boolean> => {
    let levelCorsError = false;
    try {
      const kbMetaDocRef = doc(db, levelPath);
      const kbMetaDocSnap = await getDoc(kbMetaDocRef);
      let sourcesFromDb: KnowledgeSource[] = [];
      if (kbMetaDocSnap.exists() && kbMetaDocSnap.data()?.sources) {
        sourcesFromDb = kbMetaDocSnap.data().sources as KnowledgeSource[];
      }
      if (sourcesFromDb.length > 0) {
        const summary = `The ${levelName.toLowerCase()} priority knowledge base includes these files: ` +
                        sourcesFromDb.map(s => `${s.name} (Type: ${s.type})`).join(', ') + ".";
        setSummary(summary);
        const textFileContents: string[] = [];
        for (const source of sourcesFromDb) {
          if (source.type === 'text' && source.downloadURL && typeof source.downloadURL === 'string' && source.downloadURL.trim() !== '') {
            if (source.extractedText && source.extractionStatus === 'success') {
                textFileContents.push(`Content from ${source.name} (${levelName} Priority - .txt file):\n${source.extractedText}\n---`);
            } else if (source.downloadURL) { 
                try {
                    const response = await fetch(source.downloadURL);
                    if (response.ok) {
                        const textContent = await response.text();
                        textFileContents.push(`Content from ${source.name} (${levelName} Priority - .txt file):\n${textContent}\n---`);
                    } else { if (response.type === 'opaque' || response.status === 0) levelCorsError = true; }
                } catch (fetchError: any) { levelCorsError = true; }
            }
          } else if (source.type === 'pdf' && source.extractedText && source.extractionStatus === 'success') {
            textFileContents.push(`Content from ${source.name} (${levelName} Priority - Extracted PDF Text):\n${source.extractedText}\n---`);
          }
        }
        setContent(textFileContents.join('\n\n'));
      } else { setSummary(''); setContent(''); }
    } catch (e: any) { toast({ title: `Error Loading ${levelName} KB`, description: `Could not load ${levelName} knowledge. ${e.message || ''}`.trim(), variant: "destructive"}); levelCorsError = true; }
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
        let localApiKey: string | null = null, localVoiceId: string | null = null, localUseTtsApi: boolean = true;
        if (apiKeysDocSnap.exists()) {
          const keys = apiKeysDocSnap.data();
          localApiKey = keys.tts && typeof keys.tts === 'string' && keys.tts.trim() !== '' ? keys.tts.trim() : null;
          localVoiceId = keys.voiceId && typeof keys.voiceId === 'string' && keys.voiceId.trim() !== '' ? keys.voiceId.trim() : null;
          localUseTtsApi = typeof keys.useTtsApi === 'boolean' ? keys.useTtsApi : true;
          setElevenLabsApiKey(localApiKey); setElevenLabsVoiceId(localVoiceId); setUseTtsApi(localUseTtsApi);
          if (localUseTtsApi && (!localApiKey || !localVoiceId)) {
            toast({ title: "TTS Configuration Issue", description: "Custom TTS API is ON, but API Key/Voice ID is missing. Using browser default.", variant: "default", duration: 8000 });
          }
        } else {
          setElevenLabsApiKey(null); setElevenLabsVoiceId(null); setUseTtsApi(true);
          toast({ title: "TTS Configuration Missing", description: `API keys not found. Custom TTS may not work. Configure in Admin.`, variant: "default", duration: 8000 });
        }

        const siteAssetsDocRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
        const siteAssetsDocSnap = await getDoc(siteAssetsDocRef);
        if (siteAssetsDocSnap.exists()) {
          const assets = siteAssetsDocSnap.data();
          setAvatarSrc(assets.avatarUrl || DEFAULT_AVATAR_PLACEHOLDER_URL);
          setAnimatedAvatarSrc(assets.animatedAvatarUrl || DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL);
          setSplashImageSrc(assets.splashImageUrl || DEFAULT_SPLASH_IMAGE_SRC);
          setPersonaTraits(assets.personaTraits || DEFAULT_PERSONA_TRAITS);
          setSplashScreenWelcomeMessage(assets.splashWelcomeMessage || DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE);
          setUseKnowledgeInGreeting(typeof assets.useKnowledgeInGreeting === 'boolean' ? assets.useKnowledgeInGreeting : true);
          setCustomGreeting(assets.customGreetingMessage || DEFAULT_CUSTOM_GREETING_MAIN_PAGE);
          setResponsePauseTimeMs(assets.responsePauseTimeMs === undefined ? DEFAULT_USER_SPEECH_PAUSE_TIME_MS : Number(assets.responsePauseTimeMs));
          setTextAnimationEnabled(typeof assets.enableTextAnimation === 'boolean' ? assets.enableTextAnimation : DEFAULT_TEXT_ANIMATION_ENABLED);
          setTextAnimationSpeedMs(assets.textAnimationSpeedMs === undefined ? DEFAULT_TEXT_ANIMATION_SPEED_MS : Number(assets.textAnimationSpeedMs));

        } else {
            setAvatarSrc(DEFAULT_AVATAR_PLACEHOLDER_URL);
            setAnimatedAvatarSrc(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL);
            setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC);
            setPersonaTraits(DEFAULT_PERSONA_TRAITS);
            setSplashScreenWelcomeMessage(DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE);
            setUseKnowledgeInGreeting(true);
            setCustomGreeting(DEFAULT_CUSTOM_GREETING_MAIN_PAGE);
            setResponsePauseTimeMs(DEFAULT_USER_SPEECH_PAUSE_TIME_MS);
            setTextAnimationEnabled(DEFAULT_TEXT_ANIMATION_ENABLED);
            setTextAnimationSpeedMs(DEFAULT_TEXT_ANIMATION_SPEED_MS);
        }
      } catch (e: any) { toast({ title: "Config Error", description: `Could not load app settings: ${e.message || 'Unknown'}. Using defaults.`, variant: "destructive"});}

      const highError = await fetchAndProcessKnowledgeLevel(FIRESTORE_KB_HIGH_PATH, 'High', setKnowledgeFileSummaryHigh, setDynamicKnowledgeContentHigh); if (highError) anyCorsError = true;
      const mediumError = await fetchAndProcessKnowledgeLevel(FIRESTORE_KB_MEDIUM_PATH, 'Medium', setKnowledgeFileSummaryMedium, setDynamicKnowledgeContentMedium); if (mediumError) anyCorsError = true;
      const lowError = await fetchAndProcessKnowledgeLevel(FIRESTORE_KB_LOW_PATH, 'Low', setKnowledgeFileSummaryLow, setDynamicKnowledgeContentLow); if (lowError) anyCorsError = true;
      if (anyCorsError) setCorsErrorEncountered(true);
      setIsLoadingKnowledge(false);
    };
    if(showSplashScreen) fetchAllData(); 
  }, [toast, fetchAndProcessKnowledgeLevel, showSplashScreen]); 

  const performResetOnUnmountRef = useRef(resetConversation);
  useEffect(() => { performResetOnUnmountRef.current = resetConversation; }, [resetConversation]);
  useEffect(() => { const performResetOnUnmount = performResetOnUnmountRef.current; return () => { performResetOnUnmount(); }; }, []);

  useEffect(() => { if (splashImageSrc !== DEFAULT_SPLASH_IMAGE_SRC) setIsSplashImageLoaded(false); else setIsSplashImageLoaded(true); }, [splashImageSrc]);

  useEffect(() => {
    const handleForceGoToSplash = () => {
      if (!showSplashScreen) { 
         handleEndChatManually(); 
      }
      resetConversation();
      setAiHasInitiatedConversation(false);
      setShowSplashScreen(true);
    };
    window.addEventListener('forceGoToSplashScreen', handleForceGoToSplash);
    return () => window.removeEventListener('forceGoToSplashScreen', handleForceGoToSplash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetConversation, showSplashScreen]); 


  const getDisplayedMessages = useCallback((): Message[] => {
    if (hasConversationEnded) {
      return messages; 
    }
    if (messages.length === 0) {
      return [];
    }

    const lastMessage = messages[messages.length - 1];

    if (messages.length === 1 && lastMessage.sender === 'ai') {
      return [lastMessage];
    }

    if (lastMessage.sender === 'user') {
      return [lastMessage];
    }
    
    if (lastMessage.sender === 'ai' && messages.length > 1) {
      const secondLastMessage = messages[messages.length - 2];
      if (secondLastMessage.sender === 'user') {
        return [secondLastMessage, lastMessage];
      } else { 
        return [lastMessage];
      }
    }
    if (messages.length > 0) {
        return [messages[messages.length -1]];
    }

    return []; 
  }, [messages, hasConversationEnded]);

  const displayedMessages = useMemo(() => getDisplayedMessages(), [getDisplayedMessages]);
  const lastOverallMessage = messages.length > 0 ? messages[messages.length - 1] : null;


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
              <li>Verify with <code>gsutil cors get gs://your-storage-bucket-id.appspot.com</code> that the active policy on the bucket includes this exact Studio origin. Replace <code>your-storage-bucket-id.appspot.com</code> with your actual bucket ID.</li>
          </ul>
          <p className="font-semibold mt-2">General CORS Troubleshooting for Firebase Storage:</p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li><strong>Identify ALL Your App's Origins</strong> (Studio, Deployed, Local).</li>
            <li><strong>Create/Update <code>cors-config.json</code> file with ALL origins.</strong></li>
            <li><strong>Identify Your GCS Bucket ID.</strong></li>
            <li><strong>Use \`gsutil\` to set and verify the policy on your bucket.</strong></li>
            <li><strong>Wait &amp; Test:</strong> Allow 5-10 min. Clear browser cache/cookies. Test in Incognito.</li>
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
            <CardTitle className="text-3xl font-headline text-primary">
              {isLoadingKnowledge ? "Connecting..." : splashScreenWelcomeMessage}
            </CardTitle>
            <CardDescription className="text-base">Let&apos;s have a conversation.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-6">
            <Image
              src={splashImageSrc} alt="AI Chat Splash" width={400} height={267}
              className={cn("rounded-lg shadow-md object-cover transition-opacity duration-700 ease-in-out", (splashImageSrc !== DEFAULT_SPLASH_IMAGE_SRC && !isSplashImageLoaded) ? "opacity-0" : "opacity-100")}
              priority unoptimized={splashImageSrc.startsWith('data:image/')}
              onLoad={() => { if (splashImageSrc !== DEFAULT_SPLASH_IMAGE_SRC) setIsSplashImageLoaded(true); }}
              onError={() => { setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC); setIsSplashImageLoaded(true); }}
              data-ai-hint={(splashImageSrc === DEFAULT_SPLASH_IMAGE_SRC || splashImageSrc.includes("placehold.co")) ? "technology abstract welcome" : undefined}
            />
            <p className="text-base font-semibold text-foreground">Choose your preferred way to interact:</p>
             {isLoadingKnowledge && ( <div className="flex items-center text-sm text-muted-foreground p-2 border rounded-md bg-secondary/30"> <DatabaseZap className="mr-2 h-5 w-5 animate-pulse" /> Connecting to knowledge bases... </div> )}
            <RadioGroup value={selectedInitialMode} onValueChange={(value: CommunicationMode) => setSelectedInitialMode(value)} className="w-full space-y-2">
              <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-accent/50 transition-colors"> <RadioGroupItem value="audio-only" id="r1" disabled={isLoadingKnowledge}/> <Label htmlFor="r1" className={cn("flex-grow cursor-pointer text-base", isLoadingKnowledge && "cursor-not-allowed opacity-50")}>Audio Only</Label> </div>
              <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-accent/50 transition-colors"> <RadioGroupItem value="audio-text" id="r2" disabled={isLoadingKnowledge}/> <Label htmlFor="r2" className={cn("flex-grow cursor-pointer text-base", isLoadingKnowledge && "cursor-not-allowed opacity-50")}>Audio &amp; Text (Recommended)</Label> </div>
              <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-accent/50 transition-colors"> <RadioGroupItem value="text-only" id="r3" disabled={isLoadingKnowledge}/> <Label htmlFor="r3" className={cn("flex-grow cursor-pointer text-base", isLoadingKnowledge && "cursor-not-allowed opacity-50")}>Text Only</Label> </div>
            </RadioGroup>
            <Button onClick={handleModeSelectionSubmit} size="lg" className="w-full" disabled={isLoadingKnowledge}> <CheckCircle className="mr-2"/> {isLoadingKnowledge ? "Loading..." : "Start Chatting"} </Button>
             {!isLoadingKnowledge && useTtsApi && (elevenLabsApiKey === null || elevenLabsVoiceId === null) && ( <div className="flex items-start text-xs text-destructive/80 p-2 border border-destructive/30 rounded-md mt-2"> <AlertTriangle className="h-4 w-4 mr-1.5 mt-0.5 shrink-0" /> <span>Custom TTS is ON, but API key/Voice ID may be missing or empty. Voice features might be limited. Using browser default TTS if needed.</span> </div> )}
             {!isLoadingKnowledge && !useTtsApi && ( <div className="flex items-start text-xs text-muted-foreground p-2 border border-border rounded-md mt-2 bg-secondary/20"> <Info className="h-4 w-4 mr-1.5 mt-0.5 shrink-0" /> <span>Custom TTS API is currently OFF. Using browser default voice.</span> </div> )}
            {corsTroubleshootingAlert}
          </CardContent>
        </Card>
      </div>
    );
  }

  let currentAvatarToDisplay = avatarSrc;
  let isDisplayingAnimatedAvatar = false;
  if (isSpeaking && (communicationMode === 'audio-only' || communicationMode === 'audio-text') && animatedAvatarSrc && animatedAvatarSrc !== DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL) {
    currentAvatarToDisplay = animatedAvatarSrc;
    isDisplayingAnimatedAvatar = true;
  }


  const imageProps: React.ComponentProps<typeof Image> = {
    src: currentAvatarToDisplay,
    alt: "AI Blair Avatar",
    width: communicationMode === 'audio-only' ? 200 : 120,
    height: communicationMode === 'audio-only' ? 200 : 120,
    className: cn(
      "rounded-full border-4 border-primary shadow-md object-cover transition-all duration-300",
      isSpeaking && !isDisplayingAnimatedAvatar && "animate-pulse-speak" // Pulse only if not showing GIF
    ),
    priority: true,
    unoptimized: isDisplayingAnimatedAvatar || currentAvatarToDisplay.startsWith('data:image/') || currentAvatarToDisplay.startsWith('blob:') || !currentAvatarToDisplay.startsWith('https://'),
    onError: () => {
      if (isDisplayingAnimatedAvatar) setAnimatedAvatarSrc(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL);
      else setAvatarSrc(DEFAULT_AVATAR_PLACEHOLDER_URL);
    }
  };
  if (currentAvatarToDisplay === DEFAULT_AVATAR_PLACEHOLDER_URL || currentAvatarToDisplay.includes("placehold.co")) {
    (imageProps as any)['data-ai-hint'] = "professional woman";
  } else if (currentAvatarToDisplay === DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL) {
    (imageProps as any)['data-ai-hint'] = "animated face";
  }


  const showAiTypingIndicator = isSendingMessage && aiHasInitiatedConversation && !hasConversationEnded && !showPreparingGreeting;

  const audioOnlyLiveIndicator = () => {
    if (hasConversationEnded) return null; 
    if (showPreparingGreeting) return <div className="flex items-center justify-center rounded-lg bg-secondary p-3 text-secondary-foreground shadow animate-pulse"> <Loader2 size={20} className="mr-2 animate-spin" /> Preparing greeting... </div>;
    if (isListening && !isSpeaking && !sendTranscriptTimerRef.current && !isSendingMessage) {
      return <div className="flex items-center justify-center rounded-lg bg-accent p-3 text-accent-foreground shadow animate-pulse"> <Mic size={20} className="mr-2" /> Listening... </div>;
    }
     if (showAiTypingIndicator && !isSpeaking && !isListening) { 
      return <div className="flex items-center justify-center rounded-lg bg-muted p-3 text-muted-foreground shadow animate-pulse"> <Loader2 size={20} className="mr-2 animate-spin" /> AI Blair is preparing... </div>;
    }
    return null;
  };


  const mainContent = () => {
    if (isLoadingKnowledge && !aiHasInitiatedConversation) { 
        return ( <div className="flex flex-col items-center justify-center h-full text-center py-8"> <DatabaseZap className="h-16 w-16 text-primary mb-6 animate-pulse" /> <h2 className="mt-6 text-3xl font-bold font-headline text-primary">Loading Knowledge Bases</h2> <p className="mt-2 text-muted-foreground">Please wait while AI Blair gathers the latest information...</p> </div> );
    }

    if (communicationMode === 'audio-only') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center py-8">
          {corsTroubleshootingAlert}
          {!hasConversationEnded && <Image {...imageProps} />}
          {!hasConversationEnded && <h2 className="mt-6 text-3xl font-bold font-headline text-primary">Ask blAIr</h2>}

           <div className={cn("mt-4 flex h-12 w-full items-center justify-center", hasConversationEnded && "hidden")}>
            {audioOnlyLiveIndicator()}
          </div>

          {hasConversationEnded && (
            <div className="w-full max-w-2xl mt-2 mb-4 flex-grow">
                 <h3 className="text-xl font-semibold mb-2 text-center">Conversation Ended</h3>
                 <ConversationLog 
                    messages={displayedMessages} 
                    avatarSrc={avatarSrc}
                    textAnimationEnabled={textAnimationEnabled}
                    textAnimationSpeedMs={textAnimationSpeedMs}
                    lastOverallMessageId={lastOverallMessage?.id || null}
                    hasConversationEnded={hasConversationEnded}
                  />
                 <div className="mt-4 flex flex-col sm:flex-row justify-center items-center gap-3">
                    <Button onClick={handleSaveConversationAsPdf} variant="outline"> <Save className="mr-2 h-4 w-4" /> Save as PDF </Button>
                    <Button onClick={handleStartNewChat} variant="outline"> <RotateCcw className="mr-2 h-4 w-4" /> Start New Chat </Button>
                 </div>
            </div>
          )}
          {aiHasInitiatedConversation && !hasConversationEnded && !showPreparingGreeting && !isSpeaking && !isSendingMessage && (
            <Button onClick={handleEndChatManually} variant="default" size="default" className="mt-8">
                <Power className="mr-2 h-5 w-5" /> End Chat
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
              <h2 className="mt-4 text-2xl font-bold text-center font-headline text-primary">Ask blAIr</h2>
              {showPreparingGreeting && aiHasInitiatedConversation && !hasConversationEnded && (
                <p className="mt-2 text-center text-sm font-semibold text-muted-foreground animate-pulse">
                  Preparing greeting...
                </p>
              )}
              {showAiTypingIndicator && !isSpeaking && (
                 <p className="mt-2 text-center text-lg font-bold text-primary animate-pulse">
                  AI Blair is typing...
                </p>
              )}
            </CardContent>
          </Card>
           {corsTroubleshootingAlert}
        </div>
        <div className="md:col-span-2 flex flex-col h-full">
          <ConversationLog
            messages={displayedMessages}
            avatarSrc={avatarSrc}
            textAnimationEnabled={textAnimationEnabled}
            textAnimationSpeedMs={textAnimationSpeedMs}
            lastOverallMessageId={lastOverallMessage?.id || null}
            hasConversationEnded={hasConversationEnded}
          />
          <MessageInput
            onSendMessage={handleSendMessageRef.current}
            isSending={isSendingMessage && !hasConversationEnded}
            isSpeaking={isSpeaking && !hasConversationEnded}
            showMicButton={communicationModeRef.current === 'audio-text'}
            isListening={isListening && !hasConversationEnded}
            onToggleListening={() => toggleListeningRef.current()}
            inputValue={inputValue}
            onInputValueChange={setInputValue}
            disabled={hasConversationEnded || showPreparingGreeting || (isSendingMessage && aiHasInitiatedConversation && communicationModeRef.current !== 'audio-text') || (isSpeaking && communicationModeRef.current !== 'audio-text')}
          />
          {hasConversationEnded ? (
             <div className="mt-4 flex flex-col sm:flex-row justify-end items-center gap-3">
                <Button onClick={handleSaveConversationAsPdf} variant="outline"> <Save className="mr-2 h-4 w-4" /> Save as PDF </Button>
                <Button onClick={handleStartNewChat} variant="outline"> <RotateCcw className="mr-2 h-4 w-4" /> Start New Chat </Button>
             </div>
          ) : aiHasInitiatedConversation && ( 
             <div className="mt-3 flex justify-end">
                <Button
                  onClick={handleEndChatManually}
                  variant="outline"
                  size="sm"
                  disabled={showPreparingGreeting || (isSendingMessage && aiHasInitiatedConversation) || isSpeaking }
                >
                  <Power className="mr-2 h-4 w-4" /> End Chat
                </Button>
             </div>
          )}
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

    
