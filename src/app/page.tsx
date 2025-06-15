
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
const DEFAULT_CUSTOM_GREETING_MAIN_PAGE = "";
const DEFAULT_RESPONSE_PAUSE_TIME_MS_MAIN_PAGE = 750;


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
  const [personaTraits, setPersonaTraits] = useState<string>(DEFAULT_PERSONA_TRAITS);
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState<string | null>(null);
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState<string | null>(null);
  const [useTtsApi, setUseTtsApi] = useState<boolean>(true);
  const [useKnowledgeInGreeting, setUseKnowledgeInGreeting] = useState<boolean>(true);
  const [customGreeting, setCustomGreeting] = useState<string>(DEFAULT_CUSTOM_GREETING_MAIN_PAGE);
  const [responsePauseTimeMs, setResponsePauseTimeMs] = useState<number>(DEFAULT_RESPONSE_PAUSE_TIME_MS_MAIN_PAGE);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [communicationMode, setCommunicationMode] = useState<CommunicationMode>('audio-text');
  const [aiHasInitiatedConversation, setAiHasInitiatedConversation] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [consecutiveSilencePrompts, setConsecutiveSilencePrompts] = useState(0);
  const [hasConversationEnded, setHasConversationEnded] = useState(false);


  const [knowledgeFileSummaryHigh, setKnowledgeFileSummaryHigh] = useState<string>('');
  const [knowledgeFileSummaryMedium, setKnowledgeFileSummaryMedium] = useState<string>('');
  const [knowledgeFileSummaryLow, setKnowledgeFileSummaryLow] = useState<string>('');
  const [dynamicKnowledgeContentHigh, setDynamicKnowledgeContentHigh] = useState<string>('');
  const [dynamicKnowledgeContentMedium, setDynamicKnowledgeContentMedium] = useState<string>('');
  const [dynamicKnowledgeContentLow, setDynamicKnowledgeContentLow] = useState<string>('');

  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(true);
  const [corsErrorEncountered, setCorsErrorEncountered] = useState(false);
  const [showPreparingAudioResponseIndicator, setShowPreparingAudioResponseIndicator] = useState(false);
  const [showPreparingGreeting, setShowPreparingGreeting] = useState(false);


  const elevenLabsAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast, dismiss: dismissAllToasts } = useToast();

  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  const communicationModeRef = useRef(communicationMode);
   useEffect(() => {
    communicationModeRef.current = communicationMode;
    if (recognitionRef.current && isListeningRef.current) {
      try { recognitionRef.current.abort(); } catch(e) { /* ignore */ }
    }
    const rec = initializeSpeechRecognition();
    recognitionRef.current = rec;
    setIsListening(false); // Ensure listening is off when mode changes
    accumulatedTranscriptRef.current = '';
    if (sendTranscriptTimerRef.current) {
        clearTimeout(sendTranscriptTimerRef.current);
        sendTranscriptTimerRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communicationMode]);


  const inputValueRef = useRef(inputValue);
  useEffect(() => { inputValueRef.current = inputValue; }, [inputValue]);

  const isListeningRef = useRef(isListening);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  const isEndingSessionRef = useRef(false);
  const isAboutToSpeakForSilenceRef = useRef(false);

  const messagesRef = useRef<Message[]>([]);
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
      { id: Date.now().toString() + Math.random(), text, sender, timestamp: Date.now() },
    ]);
  }, []);

  const resetConversation = useCallback(() => {
    dismissAllToasts();
    setMessages([]);
    setIsSendingMessage(false);
    setAiHasInitiatedConversation(false);
    setInputValue('');
    setConsecutiveSilencePrompts(0);
    isEndingSessionRef.current = false;
    isAboutToSpeakForSilenceRef.current = false;
    setHasConversationEnded(false);
    setShowPreparingAudioResponseIndicator(false);
    setShowPreparingGreeting(false);

    accumulatedTranscriptRef.current = '';
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
     if (isEndingSessionRef.current && (typeof forceState === 'boolean' && forceState === true)) {
        return;
    }

    setIsListening(currentIsListening => {
      const targetIsListeningState = typeof forceState === 'boolean' ? forceState : !currentIsListening;

      if (targetIsListeningState === true) { // Attempting to START listening
        if (hasConversationEnded) return false;
        if (communicationModeRef.current === 'text-only') return false;

        // If this is a user-initiated toggle (forceState is undefined)
        // AND (AI is speaking OR a message is being sent to AI), prevent starting.
        if (typeof forceState === 'undefined' && (isSpeakingRef.current || isSendingMessage)) {
            return false;
        }
        // For programmatic calls (forceState is true), these checks are bypassed,
        // assuming the caller (e.g., handleAudioProcessEnd) has ensured it's safe to listen.

        if (sendTranscriptTimerRef.current) {
          clearTimeout(sendTranscriptTimerRef.current);
          sendTranscriptTimerRef.current = null;
        }
        setShowPreparingAudioResponseIndicator(false);

        try {
          if (communicationModeRef.current === 'audio-text') setInputValue(accumulatedTranscriptRef.current);
          recognitionRef.current?.start();
          return true;
        } catch (startError: any) {
          if (startError.name !== 'InvalidStateError' && startError.name !== 'AbortError') {
            toast({ variant: 'destructive', title: 'Microphone Start Error', description: `${startError.name}: ${startError.message || 'Could not start microphone.'}` });
          }
          return false;
        }
      } else { // Attempting to STOP listening
        if (recognitionRef.current) {
           try { recognitionRef.current.stop(); } catch(e) { /* ignore */ }
        }
        // For audio-only, if we stop listening and there's accumulated transcript, start the send timer.
        if (communicationModeRef.current === 'audio-only' && accumulatedTranscriptRef.current.trim() !== '') {
            if (sendTranscriptTimerRef.current) clearTimeout(sendTranscriptTimerRef.current);
            setShowPreparingAudioResponseIndicator(true); // Show "Preparing" as we wait for pause
            sendTranscriptTimerRef.current = setTimeout(() => {
                if (accumulatedTranscriptRef.current.trim() !== '') {
                  handleSendMessageRef.current(accumulatedTranscriptRef.current.trim(), 'voice');
                  accumulatedTranscriptRef.current = '';
                }
                sendTranscriptTimerRef.current = null;
            }, responsePauseTimeMs);
        }
        return false;
      }
    });
  }, [toast, hasConversationEnded, isSendingMessage, responsePauseTimeMs]);

  const toggleListeningRef = useRef(toggleListening);
  useEffect(() => {
    toggleListeningRef.current = toggleListening;
  }, [toggleListening]);


  const handleActualAudioStart = useCallback(() => {
    setIsSpeaking(true);
    isAboutToSpeakForSilenceRef.current = false;
    setShowPreparingAudioResponseIndicator(false);
    setShowPreparingGreeting(false);
    if (isListeningRef.current && recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {/*ignore*/}
        setIsListening(false);
    }
  }, []);

  const handleAudioProcessEnd = useCallback(() => {
    const wasSpeaking = isSpeakingRef.current;
    setIsSpeaking(false);
    isAboutToSpeakForSilenceRef.current = false;
    setShowPreparingAudioResponseIndicator(false);
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

    if (isEndingSessionRef.current && wasSpeaking) {
        setHasConversationEnded(true);
        return;
    }

    if (communicationModeRef.current === 'audio-only' && !isEndingSessionRef.current && !hasConversationEnded) {
        toggleListeningRef.current(true); // forceState will be true
    }
  }, [hasConversationEnded]);


 const browserSpeakInternal = useCallback((textForSpeech: string) => {
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

      utterance.onstart = handleActualAudioStart;
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
      handleAudioProcessEnd();
    }
  }, [handleActualAudioStart, handleAudioProcessEnd]);

 const speakText = useCallback(async (text: string) => {
    const textForSpeech = text.replace(/EZCORP/gi, "easy corp");

    if (communicationModeRef.current === 'text-only' || textForSpeech.trim() === "" || (hasConversationEnded && !isEndingSessionRef.current)) {
      setIsSpeaking(false);
      setShowPreparingAudioResponseIndicator(false);
      setShowPreparingGreeting(false);
      if (isEndingSessionRef.current && (communicationModeRef.current === 'text-only' || hasConversationEnded)) {
         setHasConversationEnded(true);
      }
      return;
    }

    if (isListeningRef.current && recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch(e) {/* ignore */}
      setIsListening(false);
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

    setShowPreparingAudioResponseIndicator(true);

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
            browserSpeakInternal(textForSpeech); return;
          }
          const audioUrl = URL.createObjectURL(audioBlob);
          if (!elevenLabsAudioRef.current) elevenLabsAudioRef.current = new Audio();
          const audio = elevenLabsAudioRef.current;
          audio.src = audioUrl;
          audio.onplay = handleActualAudioStart;
          audio.onended = handleAudioProcessEnd;
          audio.onerror = (e: Event | string) => {
            const mediaError = e instanceof Event ? (e.target as HTMLAudioElement)?.error : null;
            const errorMessage = typeof e === 'string' ? e : (mediaError?.message || 'Unknown audio error');
            if (mediaError?.code === mediaError?.MEDIA_ERR_ABORTED || errorMessage.includes("interrupted") || errorMessage.includes("The play() request was interrupted")) {
                handleAudioProcessEnd();
            } else {
                console.error("ElevenLabs Audio Playback Error:", errorMessage, mediaError);
                toast({ title: "TTS Playback Error", description: "Using browser default.", variant: "destructive" });
                browserSpeakInternal(textForSpeech);
            }
          };
          try { await audio.play(); } catch (playError: any) {
            if (playError.name === 'AbortError' || playError.message.includes("interrupted")) { handleAudioProcessEnd(); }
            else {
                console.error("ElevenLabs Audio Play Error:", playError);
                toast({ title: "TTS Play Error", description: "Using browser default.", variant: "destructive" });
                browserSpeakInternal(textForSpeech);
            }
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
    browserSpeakInternal(textForSpeech);
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
        setIsListening(false);
    }
     if (sendTranscriptTimerRef.current) {
      clearTimeout(sendTranscriptTimerRef.current);
      sendTranscriptTimerRef.current = null;
    }
    accumulatedTranscriptRef.current = '';

    addMessage(text, 'user');
    if (method === 'voice' && communicationModeRef.current === 'audio-only') {
        setInputValue('');
    }
    setIsSendingMessage(true);
    setShowPreparingAudioResponseIndicator(true);
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
      addMessage(result.aiResponse, 'ai');
      setIsSendingMessage(false);

      if (result.shouldEndConversation) {
        isEndingSessionRef.current = true;
      }
      await speakTextRef.current(result.aiResponse);
    } catch (error) {
      console.error("Error in generateChatResponse or speakText:", error);
      const errorMessage = "Sorry, I encountered an error. Please try again.";
      addMessage(errorMessage, 'ai');
      setIsSendingMessage(false);
      setShowPreparingAudioResponseIndicator(false);
      if (isEndingSessionRef.current) {
        setHasConversationEnded(true);
      } else if (communicationModeRef.current !== 'text-only') {
        await speakTextRef.current(errorMessage);
      }
    }

  }, [addMessage, personaTraits, hasConversationEnded, isSendingMessage,
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
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    if (communicationModeRef.current === 'audio-text') {
        recognition.continuous = true; // User explicitly sends
    } else if (communicationModeRef.current === 'audio-only') {
        recognition.continuous = false; // Auto-send after pause
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (isSpeakingRef.current || isSendingMessage) return;

      let interimTranscriptSegment = '';
      let finalTranscriptSegmentForCurrentEvent = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscriptSegmentForCurrentEvent += event.results[i][0].transcript;
        } else {
          interimTranscriptSegment += event.results[i][0].transcript;
        }
      }
      
      if (communicationModeRef.current === 'audio-text') {
        const currentFullTranscript = accumulatedTranscriptRef.current + finalTranscriptSegmentForCurrentEvent;
        setInputValue(currentFullTranscript + interimTranscriptSegment);
        if (finalTranscriptSegmentForCurrentEvent) {
             accumulatedTranscriptRef.current = currentFullTranscript;
        }
      } else if (communicationModeRef.current === 'audio-only') {
         if (finalTranscriptSegmentForCurrentEvent.trim()) {
            accumulatedTranscriptRef.current += finalTranscriptSegmentForCurrentEvent.trim() + ' ';
            // Recognizer with continuous=false should stop itself.
            // onend will handle starting the sendTranscriptTimer.
            // UI will show "Listening..." until onend, then potentially "Preparing..."
         }
         // For interim results, we don't update UI directly in audio-only, wait for final.
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' && communicationModeRef.current === 'audio-only' && !hasConversationEnded && !isEndingSessionRef.current && !isSpeakingRef.current && !isAboutToSpeakForSilenceRef.current && isListeningRef.current) {
          // This case will be handled by onend. If accumulatedTranscript is empty, then silence prompt.
      } else if (event.error === 'aborted' || event.error === 'canceled') {
        // Normal behavior.
      } else if (event.error === 'audio-capture') {
        toast({ title: "Microphone Issue", description: "No audio detected. Check mic & permissions.", variant: "destructive" });
        setIsListening(false);
        setShowPreparingAudioResponseIndicator(false);
      } else if (event.error !== 'network' && event.error !== 'interrupted') {
        toast({ title: "Microphone Error", description: `Mic error: ${event.error}. Please check permissions.`, variant: "destructive" });
        setIsListening(false);
        setShowPreparingAudioResponseIndicator(false);
      }
    };

    recognition.onend = () => {
      const wasListening = isListeningRef.current;
      setIsListening(false); // Recognizer has stopped.

      if (communicationModeRef.current === 'audio-only' && !isSpeakingRef.current && !isSendingMessage && !hasConversationEnded && !isEndingSessionRef.current && !isAboutToSpeakForSilenceRef.current) {
        if (sendTranscriptTimerRef.current) {
          clearTimeout(sendTranscriptTimerRef.current);
          sendTranscriptTimerRef.current = null;
        }

        if (accumulatedTranscriptRef.current.trim() !== '') {
          setShowPreparingAudioResponseIndicator(true);
          sendTranscriptTimerRef.current = setTimeout(() => {
            if (accumulatedTranscriptRef.current.trim() !== '') {
              handleSendMessageRef.current(accumulatedTranscriptRef.current.trim(), 'voice');
              accumulatedTranscriptRef.current = '';
            }
            sendTranscriptTimerRef.current = null;
          }, responsePauseTimeMs);
        } else if (wasListening) { // No accumulated text, and it was genuinely listening.
          isAboutToSpeakForSilenceRef.current = true;
          setShowPreparingAudioResponseIndicator(false);
          setConsecutiveSilencePrompts(currentPrompts => {
              const newPromptCount = currentPrompts + 1;
              if (newPromptCount >= MAX_SILENCE_PROMPTS_AUDIO_ONLY) {
                  isEndingSessionRef.current = true;
                  speakTextRef.current("It looks like you might have stepped away. Let's end this chat.");
              } else {
                  const userName = getUserNameFromHistory(messagesRef.current);
                  const promptMessage = userName ? `${userName}, are you still there?` : "Hello? Is someone there?";
                  speakTextRef.current(promptMessage);
              }
              return newPromptCount;
          });
        } else {
          // Recognizer ended, wasn't listening (e.g. after AI spoke or manual stop), and no text.
          // If conversation isn't ending, try to re-listen (handleAudioProcessEnd does this implicitly if AI just spoke)
          // Or if user manually stopped, it's fine.
           if (!isEndingSessionRef.current && !hasConversationEnded && !wasSpeaking) { // Added !wasSpeaking
             // This case might occur if recognition stopped for other reasons while AI wasn't speaking
             // and the user wasn't trying to send a message. Attempt to restart listening.
             toggleListeningRef.current(true);
           }
        }
      } else if (communicationModeRef.current === 'audio-text') {
         // In audio-text mode, onend means user stopped mic or an error.
         // inputValue should have the final transcript.
      }
    };
    return recognition;
  }, [toast, responsePauseTimeMs]);

  useEffect(() => {
    const rec = initializeSpeechRecognition();
    recognitionRef.current = rec;
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      if (sendTranscriptTimerRef.current) {
        clearTimeout(sendTranscriptTimerRef.current);
        sendTranscriptTimerRef.current = null;
      }
    };
  }, [initializeSpeechRecognition]);


  const handleModeSelectionSubmit = () => {
    resetConversation();
    setCommunicationMode(selectedInitialMode);
    setShowSplashScreen(false);
  };

  const handleEndChatManually = () => {
    isEndingSessionRef.current = true;
    isAboutToSpeakForSilenceRef.current = false;
    setShowPreparingAudioResponseIndicator(false);
    setShowPreparingGreeting(false);

    if (sendTranscriptTimerRef.current) {
      clearTimeout(sendTranscriptTimerRef.current);
      sendTranscriptTimerRef.current = null;
    }
    accumulatedTranscriptRef.current = '';

    if (isListeningRef.current && recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch(e) { /* ignore */ }
        setIsListening(false);
    }

    if (isSpeakingRef.current) {
        if (elevenLabsAudioRef.current && elevenLabsAudioRef.current.src && !elevenLabsAudioRef.current.paused) {
            elevenLabsAudioRef.current.pause();
            if (elevenLabsAudioRef.current.src.startsWith('blob:')) URL.revokeObjectURL(elevenLabsAudioRef.current.src);
            elevenLabsAudioRef.current.src = '';
        }
        if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        if (!elevenLabsAudioRef.current?.src && !(typeof window !== 'undefined' && window.speechSynthesis?.speaking)) {
             setIsSpeaking(false);
             setHasConversationEnded(true);
        }
    } else {
        setHasConversationEnded(true);
    }
  };

  const handleSaveConversationAsPdf = () => {
    console.log("Conversation Log for PDF (Not Implemented):", messagesRef.current);
    toast({
      title: "PDF Export (Placeholder)",
      description: "PDF generation is a future feature. Conversation logged to console.",
      duration: 5000,
    });
  };

  const handleStartNewChat = () => {
    resetConversation();
    // The current communicationMode remains, so the useEffect for initial greeting will trigger
    // for that mode. aiHasInitiatedConversation is set to false by resetConversation.
  };


  useEffect(() => {
    if (!showSplashScreen && !aiHasInitiatedConversation && personaTraits && messagesRef.current.length === 0 && !isSpeakingRef.current && !isSendingMessage && !isLoadingKnowledge && !hasConversationEnded) {
      setAiHasInitiatedConversation(true);
      isAboutToSpeakForSilenceRef.current = false;
      setShowPreparingGreeting(true);

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
            const result = await generateInitialGreeting(greetingInput);
            greetingToUse = result.greetingMessage;
          } catch (error) {
            console.error("Error generating initial greeting:", error);
            greetingToUse = "Hello! I had a little trouble starting up. Please try changing modes or refreshing.";
          }
        }

        if (greetingToUse) {
            addMessage(greetingToUse, 'ai');
            await speakTextRef.current(greetingToUse);
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
      showSplashScreen, aiHasInitiatedConversation, personaTraits, isSendingMessage, isLoadingKnowledge, hasConversationEnded,
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
          setSplashImageSrc(assets.splashImageUrl || DEFAULT_SPLASH_IMAGE_SRC);
          setPersonaTraits(assets.personaTraits || DEFAULT_PERSONA_TRAITS);
          setSplashScreenWelcomeMessage(assets.splashWelcomeMessage || DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE);
          setUseKnowledgeInGreeting(typeof assets.useKnowledgeInGreeting === 'boolean' ? assets.useKnowledgeInGreeting : true);
          setCustomGreeting(assets.customGreetingMessage || DEFAULT_CUSTOM_GREETING_MAIN_PAGE);
          setResponsePauseTimeMs(assets.responsePauseTimeMs === undefined ? DEFAULT_RESPONSE_PAUSE_TIME_MS_MAIN_PAGE : Number(assets.responsePauseTimeMs));
        } else { 
            setAvatarSrc(DEFAULT_AVATAR_PLACEHOLDER_URL);
            setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC);
            setPersonaTraits(DEFAULT_PERSONA_TRAITS);
            setSplashScreenWelcomeMessage(DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE);
            setUseKnowledgeInGreeting(true);
            setCustomGreeting(DEFAULT_CUSTOM_GREETING_MAIN_PAGE);
            setResponsePauseTimeMs(DEFAULT_RESPONSE_PAUSE_TIME_MS_MAIN_PAGE);
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
      handleEndChatManually(); // End current chat if active
      resetConversation(); // Reset all states
      setShowSplashScreen(true); // Show splash to allow re-selection
    };
    window.addEventListener('forceGoToSplashScreen', handleForceGoToSplash);
    return () => window.removeEventListener('forceGoToSplashScreen', handleForceGoToSplash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const imageProps: React.ComponentProps<typeof Image> = {
    src: avatarSrc, alt: "AI Blair Avatar",
    width: communicationMode === 'audio-only' ? 200 : 120,
    height: communicationMode === 'audio-only' ? 200 : 120,
    className: cn("rounded-full border-4 border-primary shadow-md object-cover transition-all duration-300", isSpeaking && "animate-pulse-speak"),
    priority: true, unoptimized: avatarSrc.startsWith('data:image/') || avatarSrc.startsWith('blob:') || !avatarSrc.startsWith('https://'),
    onError: () => setAvatarSrc(DEFAULT_AVATAR_PLACEHOLDER_URL)
  };
  if (avatarSrc === DEFAULT_AVATAR_PLACEHOLDER_URL || avatarSrc.includes("placehold.co")) { (imageProps as any)['data-ai-hint'] = "professional woman"; }

  const audioOnlyIndicator = () => {
    if (showPreparingGreeting) return <div className="flex items-center justify-center rounded-lg bg-secondary p-3 text-secondary-foreground shadow animate-pulse"> Preparing greeting... </div>;
    if (isListening) return <div className="flex items-center justify-center rounded-lg bg-accent p-3 text-accent-foreground shadow animate-pulse"> <Mic size={20} className="mr-2" /> Listening... </div>;
    if (showPreparingAudioResponseIndicator && !isSpeaking) return <div className="flex items-center justify-center rounded-lg bg-secondary p-3 text-secondary-foreground shadow animate-pulse"> <Loader2 size={20} className="mr-2 animate-spin" /> Preparing response... </div>;
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
            {audioOnlyIndicator()}
          </div>

          {hasConversationEnded && (
            <div className="w-full max-w-2xl mt-2 mb-4 flex-grow">
                 <h3 className="text-xl font-semibold mb-2 text-center">Conversation Ended</h3>
                 <ConversationLog messages={messagesRef.current} isLoadingAiResponse={false} avatarSrc={avatarSrc} />
                 <div className="mt-4 flex flex-col sm:flex-row justify-center items-center gap-3">
                    <Button onClick={handleSaveConversationAsPdf} variant="outline"> <Save className="mr-2 h-4 w-4" /> Save as PDF </Button>
                    <Button onClick={handleStartNewChat} variant="outline"> <RotateCcw className="mr-2 h-4 w-4" /> Start New Chat </Button>
                 </div>
            </div>
          )}
          {aiHasInitiatedConversation && !hasConversationEnded && ( <Button onClick={handleEndChatManually} variant="default" size="default" className="mt-8" disabled={showPreparingGreeting || isSpeaking || isSendingMessage}> <Power className="mr-2 h-5 w-5" /> End Chat </Button> )}
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
              {showPreparingGreeting && ( <p className="mt-2 text-center text-base font-semibold text-muted-foreground animate-pulse"> Preparing greeting... </p> )}
            </CardContent>
          </Card>
           {corsTroubleshootingAlert}
        </div>
        <div className="md:col-span-2 flex flex-col h-full">
          <ConversationLog messages={messagesRef.current} isLoadingAiResponse={(isSendingMessage || showPreparingAudioResponseIndicator) && aiHasInitiatedConversation && !hasConversationEnded && !showPreparingGreeting && !isSpeaking} avatarSrc={avatarSrc} />
          <MessageInput
            onSendMessage={handleSendMessageRef.current}
            isSending={isSendingMessage && !hasConversationEnded}
            isSpeaking={isSpeaking && !hasConversationEnded}
            showMicButton={communicationModeRef.current === 'audio-text'}
            isListening={isListening && !hasConversationEnded}
            onToggleListening={() => toggleListeningRef.current()}
            inputValue={inputValue}
            onInputValueChange={(value) => {
                setInputValue(value);
                if (communicationModeRef.current === 'audio-text') {
                    accumulatedTranscriptRef.current = value;
                }
            }}
            disabled={hasConversationEnded || showPreparingGreeting || (isSendingMessage && aiHasInitiatedConversation)}
          />
          {hasConversationEnded ? (
             <div className="mt-4 flex flex-col sm:flex-row justify-end items-center gap-3">
                <Button onClick={handleSaveConversationAsPdf} variant="outline"> <Save className="mr-2 h-4 w-4" /> Save as PDF </Button>
                <Button onClick={handleStartNewChat} variant="outline"> <RotateCcw className="mr-2 h-4 w-4" /> Start New Chat </Button>
             </div>
          ) : aiHasInitiatedConversation && (
             <div className="mt-3 flex justify-end">
                <Button onClick={handleEndChatManually} variant="outline" size="sm" disabled={showPreparingGreeting || (isSendingMessage && aiHasInitiatedConversation) || isSpeaking}> <Power className="mr-2 h-4 w-4" /> End Chat </Button>
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
    
