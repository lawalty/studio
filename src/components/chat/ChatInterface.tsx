
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ConversationLog from '@/components/chat/ConversationLog';
import MessageInput from '@/components/chat/MessageInput';
import { generateChatResponse, type GenerateChatResponseInput, type GenerateChatResponseOutput } from '@/ai/flows/generate-chat-response';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Label } from '@/components/ui/label';
import { Mic, Square as SquareIcon, Power, DatabaseZap, AlertTriangle, Info, Loader2, Save, RotateCcw } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useLanguage } from '@/context/LanguageContext';


export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'model';
  timestamp: number;
  pdfReference?: {
    fileName: string;
    downloadURL: string;
  };
  audioDurationMs?: number;
}

const DEFAULT_AVATAR_PLACEHOLDER_URL = "https://placehold.co/150x150.png";
const DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL = "https://placehold.co/150x150.png?text=GIF";
const DEFAULT_PERSONA_TRAITS = "You are AI Blair, a knowledgeable and helpful assistant specializing in the pawn store industry. You are professional, articulate, and provide clear, concise answers based on your knowledge base. Your tone is engaging and conversational.";
const DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE = "Welcome to AI Chat";
const DEFAULT_CUSTOM_GREETING_MAIN_PAGE = "";
const DEFAULT_CONVERSATIONAL_TOPICS_MAIN_PAGE = "";
const DEFAULT_USER_SPEECH_PAUSE_TIME_MS = 750;
const DEFAULT_TYPING_SPEED_MS = 40;
const DEFAULT_ANIMATION_SYNC_FACTOR = 0.9;


const FIRESTORE_API_KEYS_PATH = "configurations/api_keys_config";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";

const ACKNOWLEDGEMENT_THRESHOLD_LENGTH = 500;
const ACKNOWLEDGEMENT_PHRASES = [
  "Okay, good question. Let me gather that information for you.",
  "Just a moment, I'm preparing your detailed response.",
  "That's an interesting point! This might take me a few seconds to look into.",
  "Let me check on that for you.",
  "One moment while I find the best answer.",
];


export type CommunicationMode = 'audio-text' | 'text-only' | 'audio-only';

interface ChatInterfaceProps {
  communicationMode: CommunicationMode;
}

const MAX_SILENCE_PROMPTS_AUDIO_ONLY = 2;


function generateChatLogHtml(messagesToRender: Message[], aiAvatarSrc: string, titleMessage: string): string {
  const primaryBg = 'hsl(210 13% 50%)';
  const primaryFg = 'hsl(0 0% 98%)';
  const secondaryBg = 'hsl(205 70% 70%)';
  const secondaryFg = 'hsl(212 60% 25%)';
  const cardBg = 'hsl(0 0% 100%)';
  const defaultFg = 'hsl(212 68% 11%)';
  const mutedFg = 'hsl(212 30% 40%)';
  const userAvatarBg = 'hsl(0 0% 90%)';

  const sanitizedTitle = titleMessage
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  let html = `<div style="background-color: ${cardBg}; color: ${defaultFg}; padding: 20px; font-family: Inter, sans-serif; width: 100%; box-sizing: border-box; max-width: 700px; margin: 0 auto;">`;

  html += `<h1 style="font-size: 20px; font-weight: bold; color: ${defaultFg}; text-align: center; margin-bottom: 20px; border-bottom: 1px solid ${mutedFg}; padding-bottom: 10px;">${sanitizedTitle}</h1>`;

  messagesToRender.forEach(message => {
    const isUser = message.sender === 'user';
    const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sanitizedText = message.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    if (isUser) {
      html += `
        <div style="display: flex; justify-content: flex-end; margin-bottom: 16px; align-items: flex-start;">
          <div style="max-width: 75%; background-color: ${primaryBg}; color: ${primaryFg}; padding: 10px 12px; border-radius: 12px; border-bottom-right-radius: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            <p style="font-size: 14px; white-space: pre-wrap; margin: 0; word-wrap: break-word;">${sanitizedText}</p>
            <p style="font-size: 10px; color: hsla(0,0%,98%,0.75); text-align: right; margin: 5px 0 0 0;">${time}</p>
          </div>
          <div style="width: 32px; height: 32px; margin-left: 8px; background-color: ${userAvatarBg}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size:14px; font-weight: 500; color: ${defaultFg}; flex-shrink: 0;">
            U
          </div>
        </div>
      `;
    } else {
      html += `
        <div style="display: flex; justify-content: flex-start; margin-bottom: 16px; align-items: flex-start;">
          <img src="${aiAvatarSrc || DEFAULT_AVATAR_PLACEHOLDER_URL}" alt="AI Avatar" style="width: 32px; height: 32px; border-radius: 50%; margin-right: 8px; flex-shrink: 0; object-fit: cover;" />
          <div style="max-width: 75%; background-color: ${secondaryBg}; color: ${secondaryFg}; padding: 10px 12px; border-radius: 12px; border-bottom-left-radius: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            <p style="font-size: 14px; white-space: pre-wrap; margin: 0; word-wrap: break-word;">${sanitizedText}</p>
            <p style="font-size: 10px; color: ${mutedFg}; text-align: left; margin: 5px 0 0 0;">${time}</p>
          </div>
        </div>
      `;
    }
  });
  html += `</div>`;
  return html;
}

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

const getVisibleChatBubbles = (allMessages: Message[]): Message[] => {
  if (allMessages.length === 0) {
    return [];
  }
  if (allMessages.length === 1) {
    return [allMessages[0]];
  }

  const lastMessage = allMessages[allMessages.length - 1];
  const secondLastMessage = allMessages[allMessages.length - 2];

  if (lastMessage.sender === 'model') {
    if (secondLastMessage.sender === 'user') {
      return [secondLastMessage, lastMessage];
    } else {
      return [lastMessage];
    }
  } else {
    return [lastMessage];
  }
};


export default function ChatInterface({ communicationMode: initialCommunicationMode }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string>(DEFAULT_AVATAR_PLACEHOLDER_URL);
  const [animatedAvatarSrc, setAnimatedAvatarSrc] = useState<string>(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL);
  const [personaTraits, setPersonaTraits] = useState<string>(DEFAULT_PERSONA_TRAITS);
  const [conversationalTopics, setConversationalTopics] = useState<string>(DEFAULT_CONVERSATIONAL_TOPICS_MAIN_PAGE);
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState<string | null>(null);
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState<string | null>(null);
  const [useTtsApi, setUseTtsApi] = useState<boolean>(true);
  const [customGreeting, setCustomGreeting] = useState<string>(DEFAULT_CUSTOM_GREETING_MAIN_PAGE);
  const [responsePauseTimeMs, setResponsePauseTimeMs] = useState<number>(DEFAULT_USER_SPEECH_PAUSE_TIME_MS);
  const [splashScreenWelcomeMessage, setSplashScreenWelcomeMessage] = useState<string>(DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [communicationMode, setCommunicationMode] = useState<CommunicationMode>(initialCommunicationMode);
  const [aiHasInitiatedConversation, setAiHasInitiatedConversation] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [consecutiveSilencePrompts, setConsecutiveSilencePrompts] = useState(0);
  const [hasConversationEnded, setHasConversationEnded] = useState(false);
  const [showPreparingGreeting, setShowPreparingGreeting] = useState(false);
  const [typingSpeedMs, setTypingSpeedMs] = useState<number>(DEFAULT_TYPING_SPEED_MS);
  const [animationSyncFactor, setAnimationSyncFactor] = useState<number>(DEFAULT_ANIMATION_SYNC_FACTOR);
  const [forceFinishAnimationForMessageId, setForceFinishAnimationForMessageId] = useState<string | null>(null);

  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  
  const router = useRouter();
  const { language, translate } = useLanguage();

  const [uiText, setUiText] = useState({
    loadingConfig: "Loading Chat Configuration",
    pleaseWait: "Please wait a moment...",
    preparingGreeting: "Preparing greeting...",
    listening: "Listening...",
    isPreparing: "AI Blair is preparing...",
    isTyping: "AI Blair is typing...",
    conversationEnded: "Conversation Ended",
    saveAsPdf: "Save as PDF",
    startNewChat: "Start New Chat",
    endChat: "End Chat",
    micNotReadyTitle: "Mic Not Ready",
    micNotReadyDesc: "Speech recognition not available. Try refreshing.",
    aiSpeakingTitle: "AI Speaking",
    aiSpeakingDesc: "Please wait for AI Blair to finish speaking.",
    processingTitle: "Processing",
    processingDesc: "Please wait for the current message to process.",
    micErrorTitle: "Microphone Error",
    micErrorDesc: "Mic error: {error}. Please check permissions.",
    micIssueTitle: "Microphone Issue",
    micIssueDesc: "No audio detected. Check mic & permissions.",
    goodQuestion: "Okay, good question. Let me gather that information for you.",
    preparingResponse: "Just a moment, I'm preparing your detailed response.",
    interestingPoint: "That's an interesting point! This might take me a few seconds to look into.",
    letMeCheck: "Let me check on that for you.",
    oneMoment: "One moment while I find the best answer.",
    endSessionMessage: "It looks like you might have stepped away. Let's end this chat.",
    areYouThereUser: "{userName}, are you still there?",
    areYouThereGuest: "Hello? Is someone there?",
    errorEncountered: "Sorry, I encountered an error. Please try again.",
    chatLogTitle: "Chat with AI Blair"
  });

  const elevenLabsAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any | null>(null);
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
  const isSpeakingAcknowledgementRef = useRef(false);
  const mainResponsePendingAfterAckRef = useRef(false);


  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const currentAiMessageIdRef = useRef<string | null>(null);

  const accumulatedTranscriptRef = useRef<string>('');
  const sendTranscriptTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const translateUi = async () => {
        const englishStrings = {
            loadingConfig: "Loading Chat Configuration", pleaseWait: "Please wait a moment...", preparingGreeting: "Preparing greeting...", listening: "Listening...",
            isPreparing: "AI Blair is preparing...", isTyping: "AI Blair is typing...", conversationEnded: "Conversation Ended", saveAsPdf: "Save as PDF",
            startNewChat: "Start New Chat", endChat: "End Chat", micNotReadyTitle: "Mic Not Ready", micNotReadyDesc: "Speech recognition not available. Try refreshing.",
            aiSpeakingTitle: "AI Speaking", aiSpeakingDesc: "Please wait for AI Blair to finish speaking.", processingTitle: "Processing", processingDesc: "Please wait for the current message to process.",
            micErrorTitle: "Microphone Error", micErrorDesc: "Mic error: {error}. Please check permissions.", micIssueTitle: "Microphone Issue",
            micIssueDesc: "No audio detected. Check mic & permissions.", goodQuestion: "Okay, good question. Let me gather that information for you.",
            preparingResponse: "Just a moment, I'm preparing your detailed response.", interestingPoint: "That's an interesting point! This might take me a few seconds to look into.",
            letMeCheck: "Let me check on that for you.", oneMoment: "One moment while I find the best answer.", endSessionMessage: "It looks like you might have stepped away. Let's end this chat.",
            areYouThereUser: "{userName}, are you still there?", areYouThereGuest: "Hello? Is someone there?", errorEncountered: "Sorry, I encountered an error. Please try again.",
            chatLogTitle: "Chat with AI Blair"
        };

        if (language === 'English') {
            setUiText(englishStrings);
            return;
        }

        const translatedEntries = await Promise.all(
            Object.entries(englishStrings).map(async ([key, value]) => [key, await translate(value)])
        );
        
        setUiText(Object.fromEntries(translatedEntries));
    };

    translateUi();
}, [language, translate]);

  const addMessage = useCallback((text: string, sender: 'user' | 'model', pdfReference?: Message['pdfReference'], audioDurationMs?: number): string => {
    const newMessageId = Date.now().toString() + Math.random();
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: newMessageId, text, sender: sender, timestamp: Date.now(), pdfReference, audioDurationMs },
    ]);
    return newMessageId;
  }, []);
  
  const updateMessageDuration = useCallback((messageId: string, audioDurationMs: number) => {
    setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, audioDurationMs } : msg
    ));
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
    isSpeakingAcknowledgementRef.current = false;
    mainResponsePendingAfterAckRef.current = false;
    setHasConversationEnded(false);
    setShowPreparingGreeting(false);
    currentAiMessageIdRef.current = null;
    setForceFinishAnimationForMessageId(null);


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
      toast({ title: uiText.micNotReadyTitle, description: uiText.micNotReadyDesc, variant: "destructive" });
      return;
    }
    const targetIsListeningState = typeof forceState === 'boolean' ? forceState : !isListeningRef.current;

    if (targetIsListeningState === true) {
      if (hasConversationEnded) { setIsListening(false); return; }
      if (communicationModeRef.current === 'text-only') { setIsListening(false); return; }
      if (typeof forceState === 'undefined') {
         if (isSpeakingRef.current) {
            toast({ title: uiText.aiSpeakingTitle, description: uiText.aiSpeakingDesc, variant: "default"});
            setIsListening(false); return;
         }
         if (isSendingMessage) {
            toast({ title: uiText.processingTitle, description: uiText.processingDesc, variant: "default"});
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
          toast({ variant: 'destructive', title: uiText.micErrorTitle, description: uiText.micErrorDesc.replace('{error}', `${startError.name}: ${startError.message || 'Could not start microphone.'}`) });
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
  }, [toast, hasConversationEnded, isSendingMessage, uiText]);

  const toggleListeningRef = useRef(toggleListening);
  useEffect(() => { toggleListeningRef.current = toggleListening; }, [toggleListening]);

  const handleActualAudioStart = useCallback(() => {
    setIsSpeaking(true);
    isAboutToSpeakForSilenceRef.current = false;
    setShowPreparingGreeting(false);
    setForceFinishAnimationForMessageId(null);
    if (isListeningRef.current && recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {/*ignore*/}
    }
  }, []);

  const handleAudioProcessEnd = useCallback(() => {
    const wasSpeakingBeforeEnd = isSpeakingRef.current;
    const endedMessageId = currentAiMessageIdRef.current;

    setIsSpeaking(false);
    setShowPreparingGreeting(false);

    if (endedMessageId && communicationModeRef.current !== 'text-only') {
        setForceFinishAnimationForMessageId(endedMessageId);
        setTimeout(() => setForceFinishAnimationForMessageId(null), 50);
    }
    currentAiMessageIdRef.current = null;


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
  }, [hasConversationEnded, toggleListeningRef]);

  const speakText = useCallback((text: string, messageIdForAnimationSync: string | null, onSpeechStartCallback?: () => void, isAcknowledgement: boolean = false): Promise<number> => {
    return new Promise<number>((resolveSpeakText) => {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
      if (elevenLabsAudioRef.current) {
        elevenLabsAudioRef.current.pause();
        if (elevenLabsAudioRef.current.src && elevenLabsAudioRef.current.src.startsWith('blob:')) {
          URL.revokeObjectURL(elevenLabsAudioRef.current.src);
        }
        elevenLabsAudioRef.current.src = '';
      }
      currentAiMessageIdRef.current = messageIdForAnimationSync;
      if (isAcknowledgement) isSpeakingAcknowledgementRef.current = true;

      const commonCleanupAndResolve = (duration: number) => {
        if (isSpeakingAcknowledgementRef.current && isAcknowledgement) isSpeakingAcknowledgementRef.current = false;
        handleAudioProcessEnd();
        resolveSpeakText(duration);
      };
      
      if (communicationModeRef.current === 'text-only' || text.trim() === "" || (hasConversationEnded && !isEndingSessionRef.current)) {
        onSpeechStartCallback?.();
        handleAudioProcessEnd();
        if (isEndingSessionRef.current && (communicationModeRef.current === 'text-only' || hasConversationEnded)) {
            setHasConversationEnded(true);
        }
        resolveSpeakText(0);
        return;
      }
      
      if (isListeningRef.current && recognitionRef.current) { try { recognitionRef.current.abort(); } catch (e) { } }
      if (sendTranscriptTimerRef.current) { clearTimeout(sendTranscriptTimerRef.current); sendTranscriptTimerRef.current = null; }
      setIsSpeaking(false);
      if (!isAcknowledgement && messagesRef.current.length <= 1 && messagesRef.current.find(m => m.sender === 'model')) {
        setShowPreparingGreeting(true);
      }

      const tryBrowserFallback = () => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          let startTime = 0;
          const utterance = new SpeechSynthesisUtterance(text.replace(/EZCORP/gi, "easy corp"));
          utterance.pitch = 1; utterance.rate = 1;
          const voices = window.speechSynthesis.getVoices();
          let selectedVoice = voices.find(voice => voice.lang === 'en-US' && (voice.name.toLowerCase().includes('male') || voice.name.toLowerCase().includes('david') || voice.name.toLowerCase().includes('mark') || voice.name.toLowerCase().includes('microsoft david') || voice.name.toLowerCase().includes('google us english male'))) ||
            voices.find(voice => voice.lang.startsWith('en-') && (voice.name.toLowerCase().includes('male'))) ||
            voices.find(voice => voice.lang === 'en-US');
          if (selectedVoice) utterance.voice = selectedVoice;
          
          utterance.onstart = () => { 
              startTime = Date.now();
              onSpeechStartCallback?.(); 
              handleActualAudioStart(); 
          };
          utterance.onend = () => {
              const duration = Date.now() - startTime;
              commonCleanupAndResolve(duration);
          };
          utterance.onerror = (event: any) => {
            if (event.error !== 'interrupted' && event.error !== 'aborted' && event.error !== 'canceled') console.error("Browser TTS Error:", event.error);
            commonCleanupAndResolve(0);
          };
          window.speechSynthesis.speak(utterance);
        } else {
          console.warn("Browser TTS not supported.");
          resolveSpeakText(0);
        }
      };

      if (useTtsApi && elevenLabsApiKey && elevenLabsVoiceId) {
        const ttsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`;
        const headers = { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': elevenLabsApiKey };
        const body = JSON.stringify({ text: text.replace(/EZCORP/gi, "easy corp"), model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true } });
        
        fetch(ttsUrl, { method: "POST", headers, body })
          .then(response => { if (!response.ok) throw new Error(`API returned ${response.status}`); return response.blob(); })
          .then(audioBlob => {
            if (audioBlob.size === 0 || !audioBlob.type.startsWith('audio/')) throw new Error('Received invalid or empty audio data from API.');
            if (!elevenLabsAudioRef.current) elevenLabsAudioRef.current = new Audio();
            const audio = elevenLabsAudioRef.current;
            let durationMs = 0;

            audio.onloadedmetadata = () => {
              durationMs = audio.duration * 1000;
            };
            audio.src = URL.createObjectURL(audioBlob);

            audio.onplay = () => { onSpeechStartCallback?.(); handleActualAudioStart(); };
            audio.onended = () => {
              commonCleanupAndResolve(durationMs);
              if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
            };
            audio.onerror = (e: Event | string) => {
              let errorMessage = "Unknown audio error";
              if (typeof e !== 'string' && e.target) {
                errorMessage = (e.target as HTMLAudioElement)?.error?.message || "Audio element error";
              } else if (typeof e === 'string') {
                errorMessage = e;
              }
              console.warn("HTMLAudioElement.onerror triggered:", errorMessage);
              tryBrowserFallback();
            };
            const playPromise = audio.play();
            playPromise?.catch(error => {
              if (error.name === 'AbortError') { 
                resolveSpeakText(0); 
              } else {
                console.error("Error during audio.play():", error);
                toast({ title: "Playback Start Error", description: `Could not start playing audio: ${error.message}`, variant: "destructive" });
                tryBrowserFallback();
              }
            });
          })
          .catch(error => {
            console.error("Error in API speech path:", error);
            toast({ title: `TTS API Error`, description: `Using browser default.`, variant: "destructive" });
            tryBrowserFallback();
          });
          return;
      }
      tryBrowserFallback();
    });
  }, [useTtsApi, elevenLabsApiKey, elevenLabsVoiceId, toast, handleActualAudioStart, handleAudioProcessEnd, hasConversationEnded]);


  const speakTextRef = useRef(speakText);
  useEffect(() => { speakTextRef.current = speakText; }, [speakText]);

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
    mainResponsePendingAfterAckRef.current = false;

    const historyForGenkit = messagesRef.current.map(msg => ({ 
      role: msg.sender, 
      parts: [{ text: msg.text }] 
    }));

    try {
      const flowInput: GenerateChatResponseInput = {
        personaTraits: personaTraits,
        conversationalTopics: conversationalTopics,
        chatHistory: historyForGenkit,
        language: language,
      };
      
      const translatedAckPhrases = [
        uiText.goodQuestion, uiText.preparingResponse, uiText.interestingPoint, uiText.letMeCheck, uiText.oneMoment
      ];

      const result: GenerateChatResponseOutput = await generateChatResponse(flowInput);
      
      if (communicationModeRef.current !== 'text-only' && result.aiResponse.length > ACKNOWLEDGEMENT_THRESHOLD_LENGTH) {
        mainResponsePendingAfterAckRef.current = true;
        const randomAckPhrase = translatedAckPhrases[Math.floor(Math.random() * translatedAckPhrases.length)];
        await speakTextRef.current(randomAckPhrase, null, undefined, true);
      }

      let newAiMessageId: string | null = null;
      const onSpeechActuallyStarting = () => {
        setTimeout(() => {
          if (!isEndingSessionRef.current || (isEndingSessionRef.current && result.shouldEndConversation)) {
            newAiMessageId = addMessage(result.aiResponse, 'model', result.pdfReference);
            currentAiMessageIdRef.current = newAiMessageId;
          }
          setIsSendingMessage(false);
        }, 50);
      };
      if (result.shouldEndConversation) { isEndingSessionRef.current = true; }
      
      const audioDuration = await speakTextRef.current(result.aiResponse, newAiMessageId, onSpeechActuallyStarting, false);

      if (newAiMessageId && audioDuration > 0) {
        updateMessageDuration(newAiMessageId, audioDuration);
      }

      mainResponsePendingAfterAckRef.current = false;
    } catch (error) {
      console.error("Error in generateChatResponse or speakText:", error);
      const errorMessage = uiText.errorEncountered;
      let errorAiMessageId: string | null = null;
      if (!isEndingSessionRef.current) {
        errorAiMessageId = addMessage(errorMessage, 'model');
        setIsSendingMessage(false);
        if (communicationModeRef.current !== 'text-only') {
          await speakTextRef.current(errorMessage, errorAiMessageId, undefined, false);
        }
      } else {
        setHasConversationEnded(true);
        setIsSendingMessage(false);
      }
      mainResponsePendingAfterAckRef.current = false;
      isSpeakingAcknowledgementRef.current = false;
    }
  }, [addMessage, updateMessageDuration, personaTraits, conversationalTopics, language, hasConversationEnded, isSendingMessage, setInputValue, uiText]);

  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => { handleSendMessageRef.current = handleSendMessage; }, [handleSendMessage]);

  useEffect(() => {
    let recognition: any | null = null;
    const initializeSpeechRecognition = () => {
        if (typeof window === 'undefined') { return; }
        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) {
            if (communicationModeRef.current === 'audio-only' || communicationModeRef.current === 'audio-text') {
              toast({ title: uiText.micNotReadyTitle, description: uiText.micNotReadyDesc, variant: "destructive" });
            }
            return;
        }
        recognition = new SpeechRecognitionAPI();
        recognitionRef.current = recognition;
        
        recognition.continuous = communicationModeRef.current === 'audio-text';
        recognition.interimResults = true;
        recognition.lang = language === 'Spanish' ? 'es-MX' : 'en-US';

        recognition.onresult = (event: any) => {
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

        recognition.onerror = (event: any) => {
          setIsListening(false);
          if (sendTranscriptTimerRef.current) {
            clearTimeout(sendTranscriptTimerRef.current);
            sendTranscriptTimerRef.current = null;
          }
          if (['aborted', 'interrupted', 'canceled'].includes(event.error)) return;
          if (event.error === 'no-speech') return; // Handled by onend for audio-only
          if (event.error === 'audio-capture') {
            toast({ title: uiText.micIssueTitle, description: uiText.micIssueDesc, variant: "destructive" });
          } else if (event.error !== 'network') {
            toast({ title: uiText.micErrorTitle, description: uiText.micErrorDesc.replace('{error}', event.error), variant: "destructive" });
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
          } else if (
              transcriptToSend === '' &&
              wasListeningWhenRecognitionEnded &&
              communicationModeRef.current === 'audio-only' &&
              !isSpeakingAcknowledgementRef.current &&
              !mainResponsePendingAfterAckRef.current
            ) {
            isAboutToSpeakForSilenceRef.current = true;
            setConsecutiveSilencePrompts(currentPrompts => {
              const newPromptCount = currentPrompts + 1;
              if (newPromptCount >= MAX_SILENCE_PROMPTS_AUDIO_ONLY) {
                isEndingSessionRef.current = true;
                const endMsg = uiText.endSessionMessage;
                let endMsgId: string | null = null;
                const onEndSpeechStart = () => {
                    setTimeout(() => {
                        if (!messagesRef.current.some(m => m.text === endMsg && m.sender === 'model')) {
                            endMsgId = addMessage(endMsg, 'model');
                            currentAiMessageIdRef.current = endMsgId;
                        }
                    }, 50);
                };
                speakTextRef.current(endMsg, null, onEndSpeechStart, false);
              } else {
                const userName = getUserNameFromHistory(messagesRef.current);
                const promptMessage = userName ? uiText.areYouThereUser.replace('{userName}', userName) : uiText.areYouThereGuest;
                let promptMsgId: string | null = null;
                const onPromptSpeechStart = () => {
                    setTimeout(() => {
                       if (!messagesRef.current.some(m => m.text === promptMessage && m.sender === 'model')) {
                           promptMsgId = addMessage(promptMessage, 'model');
                           currentAiMessageIdRef.current = promptMsgId;
                        }
                    }, 50);
                };
                speakTextRef.current(promptMessage, null, onPromptSpeechStart, false);
              }
              return newPromptCount;
            });
          } else if (
              communicationModeRef.current === 'audio-only' &&
              !hasConversationEnded &&
              !isEndingSessionRef.current &&
              !isAboutToSpeakForSilenceRef.current &&
              !isSpeakingAcknowledgementRef.current &&
              !mainResponsePendingAfterAckRef.current
            ) {
            toggleListeningRef.current(true);
          }
        };
    }
    initializeSpeechRecognition();
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) { }
        recognitionRef.current = null;
      }
      if (sendTranscriptTimerRef.current) {
        clearTimeout(sendTranscriptTimerRef.current);
        sendTranscriptTimerRef.current = null;
      }
    };
  }, [responsePauseTimeMs, toast, addMessage, isSendingMessage, hasConversationEnded, language, uiText]);


  const handleEndChatManually = () => {
    isEndingSessionRef.current = true;
    isAboutToSpeakForSilenceRef.current = false;
    isSpeakingAcknowledgementRef.current = false;
    mainResponsePendingAfterAckRef.current = false;
    setShowPreparingGreeting(false);
    setIsSendingMessage(false);
    if (sendTranscriptTimerRef.current) { clearTimeout(sendTranscriptTimerRef.current); sendTranscriptTimerRef.current = null; }
    accumulatedTranscriptRef.current = '';
    setInputValue('');
    if (isListeningRef.current && recognitionRef.current) { try { recognitionRef.current.abort(); } catch(e) {} }
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
    toast({ title: "Generating PDF...", description: "This may take a moment for long conversations." });
    
    const jsPDF = (await import('jspdf')).default;
    const html2canvas = (await import('html2canvas')).default;
    
    const tempContainer = document.createElement('div');
    tempContainer.style.width = '700px';
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '-9999px';
    tempContainer.style.fontFamily = 'Inter, sans-serif';

    const chatLogHtml = generateChatLogHtml(messages, avatarSrc, uiText.chatLogTitle);
    tempContainer.innerHTML = chatLogHtml;
    document.body.appendChild(tempContainer);

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));

      const canvas = await html2canvas(tempContainer, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FFFFFF',
        logging: false,
      });

      document.body.removeChild(tempContainer);

      if (canvas.width === 0 || canvas.height === 0) {
         toast({ title: "Canvas Capture Error", description: "Captured canvas is empty. PDF cannot be generated.", variant: "destructive" });
         console.error("html2canvas produced an empty or zero-dimension canvas from the temporary HTML container.");
         return;
      }

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
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
        position = position - (pdfHeight - (pageMargin * 2)) + pageMargin;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', pageMargin, position, contentWidth, imgHeight);
        heightLeft -= (pdfHeight - (pageMargin * 2));
      }

      pdf.save('AI-Blair-Conversation.pdf');
      toast({ title: "PDF Generated", description: "Your conversation has been saved." });

    } catch (error) {
      console.error("Error generating PDF:", error);
      if (tempContainer.parentElement) {
         document.body.removeChild(tempContainer);
      }
      toast({ title: "PDF Generation Failed", description: "Could not save the conversation as PDF. See console for details.", variant: "destructive" });
    }
  };

  const handleStartNewChat = () => {
    router.push('/');
  };

  useEffect(() => {
    if (!aiHasInitiatedConversation && personaTraits && messages.length === 0 && !isSpeakingRef.current && !isSendingMessage && !isLoadingConfig && !hasConversationEnded) {
      setAiHasInitiatedConversation(true);
      isAboutToSpeakForSilenceRef.current = false;
      
      const initConversation = async () => {
        setShowPreparingGreeting(true);
        
        let greetingToUse = "";
        let greetingMessageId: string | null = null;
        
        // Path 1: A custom, scripted greeting is provided. This is the fastest path.
        if (customGreeting && customGreeting.trim() !== "") {
          greetingToUse = customGreeting.trim();
          if (language !== 'English') {
            greetingToUse = await translate(greetingToUse);
          }
        } 
        // Path 2: No custom greeting. Ask the AI to generate one.
        else {
            try {
                const flowInput: GenerateChatResponseInput = {
                    personaTraits: personaTraits,
                    conversationalTopics: conversationalTopics,
                    chatHistory: [], // Empty history triggers a greeting
                    language: language,
                };
                const result = await generateChatResponse(flowInput);
                greetingToUse = result.aiResponse;
            } catch (error) {
                console.error("Error generating initial greeting:", error);
                greetingToUse = language === 'Spanish' ? "Hola! ¿Como puedo ayudarte hoy?" : "Hello! How can I help you today?";
            }
        }
        
        const onGreetingSpeechActuallyStarting = () => {
          setTimeout(() => {
            if (!isEndingSessionRef.current) {
              greetingMessageId = addMessage(greetingToUse, 'model');
              currentAiMessageIdRef.current = greetingMessageId;
            }
          }, 50);
        };

        const audioDuration = await speakTextRef.current(greetingToUse, greetingMessageId, onGreetingSpeechActuallyStarting, false);
        
        if (greetingMessageId && audioDuration > 0) {
            updateMessageDuration(greetingMessageId, audioDuration);
        }

        if(communicationModeRef.current === 'text-only') {
          setShowPreparingGreeting(false);
        }
      };
      
      initConversation();
    }
  }, [aiHasInitiatedConversation, customGreeting, messages.length, addMessage, isSendingMessage, isLoadingConfig, hasConversationEnded, personaTraits, conversationalTopics, language, translate, updateMessageDuration]);

  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoadingConfig(true);
      try {
        const apiKeysDocRef = doc(db, FIRESTORE_API_KEYS_PATH);
        const apiKeysDocSnap = await getDoc(apiKeysDocRef);
        if (apiKeysDocSnap.exists()) {
          const keys = apiKeysDocSnap.data();
          const localApiKey = keys.tts && typeof keys.tts === 'string' && keys.tts.trim() !== '' ? keys.tts.trim() : null;
          const localVoiceId = keys.voiceId && typeof keys.voiceId === 'string' && keys.voiceId.trim() !== '' ? keys.voiceId.trim() : null;
          const localUseTtsApi = typeof keys.useTtsApi === 'boolean' ? keys.useTtsApi : true;
          setElevenLabsApiKey(localApiKey);
          setElevenLabsVoiceId(localVoiceId);
          setUseTtsApi(localUseTtsApi);
          if (localUseTtsApi && (!localApiKey || !localVoiceId)) {
            toast({ title: "TTS Configuration Issue", description: "Custom TTS API is ON, but API Key/Voice ID is missing. Using browser default.", variant: "default", duration: 8000 });
          }
        } else {
          setElevenLabsApiKey(null);
          setElevenLabsVoiceId(null);
          setUseTtsApi(true);
          toast({ title: "TTS Configuration Missing", description: `API keys not found. Custom TTS may not work. Configure in Admin.`, variant: "default", duration: 8000 });
        }

        const siteAssetsDocRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
        const siteAssetsDocSnap = await getDoc(siteAssetsDocRef);
        if (siteAssetsDocSnap.exists()) {
          const assets = siteAssetsDocSnap.data();
          setAvatarSrc(assets.avatarUrl || DEFAULT_AVATAR_PLACEHOLDER_URL);
          setAnimatedAvatarSrc(assets.animatedAvatarUrl || DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL);
          setPersonaTraits(assets.personaTraits || DEFAULT_PERSONA_TRAITS);
          setConversationalTopics(assets.conversationalTopics || DEFAULT_CONVERSATIONAL_TOPICS_MAIN_PAGE);
          setSplashScreenWelcomeMessage(assets.splashWelcomeMessage || DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE);
          setCustomGreeting(assets.customGreetingMessage || DEFAULT_CUSTOM_GREETING_MAIN_PAGE);
          setResponsePauseTimeMs(assets.responsePauseTimeMs === undefined ? DEFAULT_USER_SPEECH_PAUSE_TIME_MS : Number(assets.responsePauseTimeMs));
          setTypingSpeedMs(assets.typingSpeedMs === undefined ? DEFAULT_TYPING_SPEED_MS : Number(assets.typingSpeedMs));
          setAnimationSyncFactor(assets.animationSyncFactor === undefined ? DEFAULT_ANIMATION_SYNC_FACTOR : Number(assets.animationSyncFactor));
        } else {
          // Set defaults if doc doesn't exist
          setAvatarSrc(DEFAULT_AVATAR_PLACEHOLDER_URL);
          setAnimatedAvatarSrc(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL);
          setPersonaTraits(DEFAULT_PERSONA_TRAITS);
          setConversationalTopics(DEFAULT_CONVERSATIONAL_TOPICS_MAIN_PAGE);
          setSplashScreenWelcomeMessage(DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE);
          setCustomGreeting(DEFAULT_CUSTOM_GREETING_MAIN_PAGE);
          setResponsePauseTimeMs(DEFAULT_USER_SPEECH_PAUSE_TIME_MS);
          setTypingSpeedMs(DEFAULT_TYPING_SPEED_MS);
          setAnimationSyncFactor(DEFAULT_ANIMATION_SYNC_FACTOR);
        }
      } catch (e: any) {
        toast({ title: "Config Error", description: `Could not load app settings: ${e.message || 'Unknown'}. Using defaults.`, variant: "destructive" });
        // Set defaults on error to allow the app to continue
        setAvatarSrc(DEFAULT_AVATAR_PLACEHOLDER_URL);
        setAnimatedAvatarSrc(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL);
        setPersonaTraits(DEFAULT_PERSONA_TRAITS);
        setConversationalTopics(DEFAULT_CONVERSATIONAL_TOPICS_MAIN_PAGE);
        setSplashScreenWelcomeMessage(DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE);
        setCustomGreeting(DEFAULT_CUSTOM_GREETING_MAIN_PAGE);
        setResponsePauseTimeMs(DEFAULT_USER_SPEECH_PAUSE_TIME_MS);
        setTypingSpeedMs(DEFAULT_TYPING_SPEED_MS);
        setAnimationSyncFactor(DEFAULT_ANIMATION_SYNC_FACTOR);
      } finally {
        setIsLoadingConfig(false);
      }
    };
    fetchAllData();
  }, [toast]);

  const performResetOnUnmountRef = useRef(resetConversation);
  useEffect(() => { performResetOnUnmountRef.current = resetConversation; }, [resetConversation]);
  useEffect(() => { const performResetOnUnmount = performResetOnUnmountRef.current; return () => { performResetOnUnmount(); }; }, []);

  const lastOverallMessage = messages.length > 0 ? messages[messages.length - 1] : null;


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
       isDisplayingAnimatedAvatar ? "avatar-is-speaking-glow" : ((isSpeaking && !isDisplayingAnimatedAvatar) && "animate-pulse-speak")
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
    if (showPreparingGreeting) return <div className="flex items-center justify-center rounded-lg bg-secondary p-3 text-secondary-foreground shadow animate-pulse"> <Loader2 size={20} className="mr-2 animate-spin" /> {uiText.preparingGreeting} </div>;
    if (isListening && !isSpeaking && !sendTranscriptTimerRef.current && !isSendingMessage) {
      return <div className="flex items-center justify-center rounded-lg bg-accent p-3 text-accent-foreground shadow animate-pulse"> <Mic size={20} className="mr-2" /> {uiText.listening} </div>;
    }
     if (showAiTypingIndicator && !isSpeaking && !isListening) {
      return <div className="flex items-center justify-center rounded-lg bg-muted p-3 text-muted-foreground shadow animate-pulse font-bold text-lg text-primary"> {uiText.isPreparing} </div>;
    }
    return null;
  };

  const messagesForLog = (communicationMode === 'audio-text' || communicationMode === 'text-only') && !hasConversationEnded
    ? getVisibleChatBubbles(messages)
    : messages;

  const mainContent = () => {
    if (isLoadingConfig && !aiHasInitiatedConversation) {
        return ( <div className="flex flex-col items-center justify-center h-full text-center py-8"> <DatabaseZap className="h-16 w-16 text-primary mb-6 animate-pulse" /> <h2 className="mt-6 text-3xl font-bold font-headline text-primary">{uiText.loadingConfig}</h2> <p className="mt-2 text-muted-foreground">{uiText.pleaseWait}</p> </div> );
    }
    if (communicationMode === 'audio-only') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center py-8">
          {!hasConversationEnded && <Image {...imageProps} alt="AI Blair Avatar" />}
          {!hasConversationEnded && <h2 className="mt-6 text-3xl font-bold font-headline text-primary">{splashScreenWelcomeMessage}</h2>}
           <div className={cn("mt-4 flex h-12 w-full items-center justify-center", hasConversationEnded && "hidden")}>
            {audioOnlyLiveIndicator()}
          </div>
          {hasConversationEnded && (
            <div className="w-full max-w-2xl mt-2 mb-4 flex-grow">
                 <h3 className="text-xl font-semibold mb-2 text-center">{uiText.conversationEnded}</h3>
                 <ConversationLog
                    messages={messages}
                    avatarSrc={avatarSrc}
                    typingSpeedMs={typingSpeedMs}
                    animationSyncFactor={animationSyncFactor}
                    communicationMode={communicationMode}
                    lastOverallMessageId={lastOverallMessage?.id || null}
                    hasConversationEnded={hasConversationEnded}
                    forceFinishAnimationForMessageId={forceFinishAnimationForMessageId}
                  />
                 <div className="mt-4 flex flex-col sm:flex-row justify-center items-center gap-3">
                    <Button onClick={handleSaveConversationAsPdf} variant="outline"> <Save className="mr-2 h-4 w-4" /> {uiText.saveAsPdf} </Button>
                    <Button onClick={handleStartNewChat} variant="outline"> <RotateCcw className="mr-2 h-4 w-4" /> {uiText.startNewChat} </Button>
                 </div>
            </div>
          )}
          {aiHasInitiatedConversation && !hasConversationEnded && !showPreparingGreeting && !isSpeaking && !isSendingMessage && (
            <Button onClick={handleEndChatManually} variant="default" size="default" className="mt-8">
                <Power className="mr-2 h-5 w-5" /> {uiText.endChat}
            </Button>
          )}
        </div>
      );
    }
    // For 'audio-text' and 'text-only' modes:
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
        <div className="md:col-span-1 flex flex-col items-center md:items-start space-y-4">
          <Card className="w-full shadow-xl">
            <CardContent className="pt-6 flex flex-col items-center">
              <Image {...imageProps} alt="AI Blair Avatar" />
              <h2 className="mt-4 text-2xl font-bold text-center font-headline text-primary">{splashScreenWelcomeMessage}</h2>
              {showPreparingGreeting && aiHasInitiatedConversation && !hasConversationEnded && (
                <p className="mt-2 text-center text-sm font-semibold text-muted-foreground animate-pulse">
                  {uiText.preparingGreeting}
                </p>
              )}
              {showAiTypingIndicator && !isSpeaking && (
                 <p className="mt-2 text-center text-lg font-bold text-primary animate-pulse">
                  {uiText.isTyping}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="md:col-span-2 flex flex-col h-full">
          <ConversationLog
            messages={messagesForLog}
            avatarSrc={avatarSrc}
            typingSpeedMs={typingSpeedMs}
            animationSyncFactor={animationSyncFactor}
            communicationMode={communicationMode}
            lastOverallMessageId={lastOverallMessage?.id || null}
            hasConversationEnded={hasConversationEnded}
            forceFinishAnimationForMessageId={forceFinishAnimationForMessageId}
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
                <Button onClick={handleSaveConversationAsPdf} variant="outline"> <Save className="mr-2 h-4 w-4" /> {uiText.saveAsPdf} </Button>
                <Button onClick={handleStartNewChat} variant="outline"> <RotateCcw className="mr-2 h-4 w-4" /> {uiText.startNewChat} </Button>
             </div>
          ) : aiHasInitiatedConversation && (
             <div className="mt-3 flex justify-end">
                <Button
                  onClick={handleEndChatManually}
                  variant="outline"
                  size="sm"
                  disabled={showPreparingGreeting || (isSendingMessage && aiHasInitiatedConversation) || isSpeaking }
                >
                  <Power className="mr-2 h-4 w-4" /> {uiText.endChat}
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
