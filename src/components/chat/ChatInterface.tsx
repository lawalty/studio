
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ConversationLog from '@/components/chat/ConversationLog';
import MessageInput from '@/components/chat/MessageInput';
import { generateChatResponse, type GenerateChatResponseInput, type GenerateChatResponseOutput } from '@/ai/flows/generate-chat-response';
import { indexDocument } from '@/ai/flows/index-document-flow';
import { extractTextFromDocument } from '@/ai/flows/extract-text-from-document-url-flow';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Mic, Power, DatabaseZap, Loader2, Save, RotateCcw } from 'lucide-react';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { useLanguage } from '@/context/LanguageContext';
import { v4 as uuidv4 } from 'uuid';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';


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
const randomAckPhrase = "Let me check on that for you.";


export type CommunicationMode = 'audio-text' | 'text-only' | 'audio-only';

interface ChatState {
    messages: Message[];
    isSendingMessage: boolean;
    isSpeaking: boolean;
    isListening: boolean;
    hasConversationEnded: boolean;
    isEndingSession: boolean;
    aiHasInitiatedConversation: boolean;
    inputValue: string;
    consecutiveSilencePrompts: number;
    showPreparingGreeting: boolean;
    newlyAddedAiMessageId: string | null;
    forceFinishAnimationForMessageId: string | null;
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


interface ChatInterfaceProps {
    communicationMode: CommunicationMode;
}

export default function ChatInterface({ communicationMode }: ChatInterfaceProps) {
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [, forceUpdate] = useState(0);

  const stateRef = useRef<ChatState>({
    messages: [],
    isSendingMessage: false,
    isSpeaking: false,
    isListening: false,
    hasConversationEnded: false,
    isEndingSession: false,
    aiHasInitiatedConversation: false,
    inputValue: '',
    consecutiveSilencePrompts: 0,
    showPreparingGreeting: false,
    newlyAddedAiMessageId: null,
    forceFinishAnimationForMessageId: null,
  });

  const configRef = useRef({
    avatarSrc: DEFAULT_AVATAR_PLACEHOLDER_URL,
    animatedAvatarSrc: DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL,
    personaTraits: DEFAULT_PERSONA_TRAITS,
    conversationalTopics: DEFAULT_CONVERSATIONAL_TOPICS_MAIN_PAGE,
    elevenLabsApiKey: null as string | null,
    elevenLabsVoiceId: null as string | null,
    useTtsApi: true,
    customGreeting: DEFAULT_CUSTOM_GREETING_MAIN_PAGE,
    responsePauseTimeMs: DEFAULT_USER_SPEECH_PAUSE_TIME_MS,
    splashScreenWelcomeMessage: DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE,
    typingSpeedMs: DEFAULT_TYPING_SPEED_MS,
    animationSyncFactor: DEFAULT_ANIMATION_SYNC_FACTOR,
  });

  const router = useRouter();
  const { language, translate } = useLanguage();

  const [uiText, setUiText] = useState({
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
  });

  const elevenLabsAudioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any | null>(null);
  const { toast, dismiss: dismissAllToasts } = useToast();
  const speechRecognitionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentAiMessageIdRef = useRef<string | null>(null);


  const addMessage = useCallback((text: string, sender: 'user' | 'model', pdfReference?: Message['pdfReference'], audioDurationMs?: number): string => {
    const newMessageId = Date.now().toString() + Math.random();
    const newMessage: Message = { id: newMessageId, text, sender, timestamp: Date.now(), pdfReference, audioDurationMs };
    stateRef.current.messages = [...stateRef.current.messages, newMessage];
    if (sender === 'model') {
      stateRef.current.newlyAddedAiMessageId = newMessageId;
    }
    forceUpdate(c => c + 1);
    return newMessageId;
  }, []);
  
  const updateMessageDuration = useCallback((messageId: string, audioDurationMs: number) => {
    stateRef.current.messages = stateRef.current.messages.map(msg => 
        msg.id === messageId ? { ...msg, audioDurationMs } : msg
    );
    forceUpdate(c => c + 1);
  }, []);

  const setInputValue = (value: string) => {
    stateRef.current.inputValue = value;
    forceUpdate(c => c + 1);
  };
  
  const speakText = useCallback((text: string, messageIdForAnimationSync: string | null, onSpeechStartCallback?: () => void, isAcknowledgement: boolean = false): Promise<number> => {
    return new Promise<number>((resolveSpeakText) => {
      if (typeof window !== 'undefined') window.speechSynthesis.cancel();
      if (elevenLabsAudioRef.current) elevenLabsAudioRef.current.pause();

      currentAiMessageIdRef.current = messageIdForAnimationSync;

      const cleanupAndResolve = (duration: number) => {
        const wasSpeakingBeforeEnd = stateRef.current.isSpeaking;
        const endedMessageId = currentAiMessageIdRef.current;
    
        stateRef.current.isSpeaking = false;
        stateRef.current.showPreparingGreeting = false;
    
        if (endedMessageId && communicationMode !== 'text-only') {
            stateRef.current.forceFinishAnimationForMessageId = endedMessageId;
            forceUpdate(c => c + 1);
            setTimeout(() => {
                stateRef.current.forceFinishAnimationForMessageId = null;
                forceUpdate(c => c + 1);
            }, 50);
        }
        currentAiMessageIdRef.current = null;
    
        if (elevenLabsAudioRef.current) {
            if (elevenLabsAudioRef.current.src && elevenLabsAudioRef.current.src.startsWith('blob:')) {
                URL.revokeObjectURL(elevenLabsAudioRef.current.src);
            }
            elevenLabsAudioRef.current.src = '';
        }

        if (stateRef.current.isEndingSession && wasSpeakingBeforeEnd) {
            stateRef.current.hasConversationEnded = true;
            forceUpdate(c => c + 1);
            return;
        }
        
        if (communicationMode === 'audio-only' && !stateRef.current.isEndingSession && !stateRef.current.hasConversationEnded) {
            if (!recognitionRef.current && (communicationMode === 'audio-only' || communicationMode === 'audio-text')) {
                toast({ title: uiText.micNotReadyTitle, description: uiText.micNotReadyDesc, variant: "destructive" });
                return;
            }
            if (stateRef.current.isListening) {
               if (recognitionRef.current) { recognitionRef.current.stop(); }
            } else {
              if (stateRef.current.hasConversationEnded || stateRef.current.isSpeaking || stateRef.current.isSendingMessage) return;
              try {
                recognitionRef.current?.start();
                stateRef.current.isListening = true;
                forceUpdate(c => c + 1);
              } catch (startError: any) {
                if (startError.name !== 'InvalidStateError' && startError.name !== 'AbortError') {
                  toast({ variant: 'destructive', title: uiText.micErrorTitle, description: uiText.micErrorDesc.replace('{error}', `${startError.name}: ${startError.message || 'Could not start microphone.'}`) });
                }
                stateRef.current.isListening = false;
                forceUpdate(c => c + 1);
              }
            }
        }
        forceUpdate(c => c + 1);
        resolveSpeakText(duration);
      };
      
      if (communicationMode === 'text-only' || text.trim() === "" || (stateRef.current.hasConversationEnded && !stateRef.current.isEndingSession)) {
        onSpeechStartCallback?.();
        cleanupAndResolve(0);
        if (stateRef.current.isEndingSession && (communicationMode === 'text-only' || stateRef.current.hasConversationEnded)) {
            stateRef.current.hasConversationEnded = true;
            forceUpdate(c => c + 1);
        }
        resolveSpeakText(0);
        return;
      }
      
      if (stateRef.current.isListening && recognitionRef.current) { try { recognitionRef.current.abort(); } catch (e) { } }
      stateRef.current.isListening = false;
      
      if (!isAcknowledgement && stateRef.current.messages.length <= 1) {
        stateRef.current.showPreparingGreeting = true;
        forceUpdate(c => c + 1);
      }

      const tryBrowserFallback = () => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          let startTime = 0;
          const utterance = new SpeechSynthesisUtterance(text.replace(/EZCORP/gi, "easy corp"));
          utterance.onstart = () => { 
              startTime = Date.now();
              onSpeechStartCallback?.(); 
              stateRef.current.isSpeaking = true;
              forceUpdate(c => c + 1);
          };
          utterance.onend = () => cleanupAndResolve(Date.now() - startTime);
          utterance.onerror = () => cleanupAndResolve(0);
          window.speechSynthesis.speak(utterance);
        } else {
          resolveSpeakText(0);
        }
      };
      const { useTtsApi, elevenLabsApiKey, elevenLabsVoiceId } = configRef.current;
      if (useTtsApi && elevenLabsApiKey && elevenLabsVoiceId) {
        fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`, { 
          method: "POST", 
          headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': elevenLabsApiKey }, 
          body: JSON.stringify({ text: text.replace(/EZCORP/gi, "easy corp"), model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
        })
          .then(response => response.ok ? response.blob() : Promise.reject(new Error(`API Error ${response.status}`)))
          .then(audioBlob => {
            if (!elevenLabsAudioRef.current) elevenLabsAudioRef.current = new Audio();
            const audio = elevenLabsAudioRef.current;
            audio.src = URL.createObjectURL(audioBlob);
            let durationMs = 0;
            audio.onloadedmetadata = () => { durationMs = audio.duration * 1000; };
            audio.onplay = () => { onSpeechStartCallback?.(); stateRef.current.isSpeaking = true; forceUpdate(c => c + 1); };
            audio.onended = () => cleanupAndResolve(durationMs);
            audio.onerror = () => { console.warn("ElevenLabs audio error, using fallback."); tryBrowserFallback(); };
            audio.play().catch(() => { console.warn("Autoplay blocked, using fallback."); tryBrowserFallback(); });
          })
          .catch(() => { console.warn("TTS API fetch failed, using fallback."); tryBrowserFallback(); });
      } else {
        tryBrowserFallback();
      }
    });
  }, [communicationMode, toast, uiText]);

  const handleSendMessage = useCallback(async (text: string, method: 'text' | 'voice') => {
    if (text.trim() === '' || stateRef.current.hasConversationEnded || stateRef.current.isSendingMessage) return;

    if (stateRef.current.isListening && recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch(e) {/* ignore */}
    }
    if (speechRecognitionTimerRef.current) {
      clearTimeout(speechRecognitionTimerRef.current);
      speechRecognitionTimerRef.current = null;
    }
    
    addMessage(text, 'user');
    setInputValue('');
    stateRef.current.isSendingMessage = true;
    stateRef.current.consecutiveSilencePrompts = 0;
    forceUpdate(c => c + 1);
    
    const historyForGenkit = [...stateRef.current.messages].map(msg => ({ 
      role: msg.sender as 'user' | 'model', 
      parts: [{ text: msg.text }] 
    }));

    try {
      const { personaTraits, conversationalTopics } = configRef.current;
      const flowInput: GenerateChatResponseInput = {
        personaTraits, conversationalTopics,
        chatHistory: historyForGenkit,
        language: language,
      };
      
      if (communicationMode !== 'text-only' && text.length > ACKNOWLEDGEMENT_THRESHOLD_LENGTH) {
        await speakText(randomAckPhrase, null, undefined, true);
      }

      const result: GenerateChatResponseOutput = await generateChatResponse(flowInput);
      
      let newAiMessageId: string | null = null;
      const onSpeechActuallyStarting = () => {
        stateRef.current.isSendingMessage = false;
        forceUpdate(c => c + 1);
        if (!stateRef.current.isEndingSession || (stateRef.current.isEndingSession && result.shouldEndConversation)) {
          newAiMessageId = addMessage(result.aiResponse, 'model', result.pdfReference);
          currentAiMessageIdRef.current = newAiMessageId;
        }
      };

      if (result.shouldEndConversation) { stateRef.current.isEndingSession = true; }
      
      const audioDuration = await speakText(result.aiResponse, newAiMessageId, onSpeechActuallyStarting, false);

      if (newAiMessageId && audioDuration > 0) {
        updateMessageDuration(newAiMessageId, audioDuration);
      }
      stateRef.current.isSendingMessage = false;
      forceUpdate(c => c + 1);

    } catch (error) {
      console.error("Error in generateChatResponse or speakText:", error);
      const errorMessage = uiText.errorEncountered;
      if (!stateRef.current.isEndingSession) {
        const errorAiMessageId = addMessage(errorMessage, 'model');
        await speakText(errorMessage, errorAiMessageId, undefined, false);
      } else {
        stateRef.current.hasConversationEnded = true;
        forceUpdate(c => c + 1);
      }
      stateRef.current.isSendingMessage = false;
      forceUpdate(c => c + 1);
    }
  }, [addMessage, updateMessageDuration, language, uiText, speakText, communicationMode]);


 const stopListeningAndProcess = useCallback(() => {
    if (!stateRef.current.isListening) return;

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current && (communicationMode === 'audio-only' || communicationMode === 'audio-text')) {
      toast({ title: uiText.micNotReadyTitle, description: uiText.micNotReadyDesc, variant: "destructive" });
      return;
    }
    
    if (stateRef.current.isListening) {
      stopListeningAndProcess();
    } else {
      if (stateRef.current.hasConversationEnded || stateRef.current.isSpeaking || stateRef.current.isSendingMessage) return;
      try {
        recognitionRef.current?.start();
        stateRef.current.isListening = true;
        forceUpdate(c => c + 1);
      } catch (startError: any) {
        if (startError.name !== 'InvalidStateError' && startError.name !== 'AbortError') {
          toast({ variant: 'destructive', title: uiText.micErrorTitle, description: uiText.micErrorDesc.replace('{error}', `${startError.name}: ${startError.message || 'Could not start microphone.'}`) });
        }
        stateRef.current.isListening = false;
        forceUpdate(c => c + 1);
      }
    }
  }, [communicationMode, toast, stopListeningAndProcess, uiText]);
  
  const resetConversation = useCallback(() => {
    dismissAllToasts();
    stateRef.current = {
        messages: [], isSendingMessage: false, isSpeaking: false, isListening: false, hasConversationEnded: false,
        isEndingSession: false, aiHasInitiatedConversation: false, inputValue: '', consecutiveSilencePrompts: 0,
        showPreparingGreeting: false, newlyAddedAiMessageId: null, forceFinishAnimationForMessageId: null,
    };
    currentAiMessageIdRef.current = null;
    if (speechRecognitionTimerRef.current) {
      clearTimeout(speechRecognitionTimerRef.current);
      speechRecognitionTimerRef.current = null;
    }
    if (stateRef.current.isListening && recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch(e) { /* ignore */ }
    }
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
    forceUpdate(c => c + 1);
  }, [dismissAllToasts]);

  useEffect(() => {
    const performResetOnUnmount = resetConversation;
    return () => { performResetOnUnmount(); };
  }, [resetConversation]);

  useEffect(() => {
    const initializeSpeechRecognition = () => {
        if (typeof window === 'undefined') { return; }
        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) {
            if (communicationMode !== 'text-only') {
              toast({ title: uiText.micNotReadyTitle, description: uiText.micNotReadyDesc, variant: "destructive" });
            }
            return;
        }
        const recognition = new SpeechRecognitionAPI();
        recognitionRef.current = recognition;
        
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language === 'Spanish' ? 'es-MX' : 'en-US';

        let finalTranscript = '';
        recognition.onresult = (event: any) => {
          if (stateRef.current.isSpeaking || stateRef.current.isSendingMessage) return;

          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          
          setInputValue(finalTranscript + interimTranscript);
          
          if (speechRecognitionTimerRef.current) clearTimeout(speechRecognitionTimerRef.current);
          speechRecognitionTimerRef.current = setTimeout(() => {
              if (stateRef.current.isListening) {
                 stopListeningAndProcess();
              }
          }, configRef.current.responsePauseTimeMs);
        };

        recognition.onend = () => {
          stateRef.current.isListening = false;
          forceUpdate(c => c + 1);
          if (speechRecognitionTimerRef.current) clearTimeout(speechRecognitionTimerRef.current);
          
          const transcriptToSend = (finalTranscript + (stateRef.current.inputValue || '')).trim();
          finalTranscript = '';
          setInputValue('');

          if (transcriptToSend && !stateRef.current.isSpeaking && !stateRef.current.isSendingMessage) {
            handleSendMessage(transcriptToSend, 'voice');
          } else if (communicationMode === 'audio-only' && !transcriptToSend && !stateRef.current.isSpeaking && !stateRef.current.isSendingMessage) {
              stateRef.current.consecutiveSilencePrompts++;
              forceUpdate(c => c + 1);
          }
        };

        recognition.onerror = (event: any) => {
          stateRef.current.isListening = false;
          forceUpdate(c => c + 1);
          if (!['no-speech', 'aborted', 'network'].includes(event.error)) {
            toast({ title: uiText.micErrorTitle, description: event.error, variant: 'destructive' });
          }
        };
    };
    initializeSpeechRecognition();
  }, [language, handleSendMessage, stopListeningAndProcess, toast, uiText, communicationMode]);

  const archiveAndIndexChat = useCallback(async () => {
    if (stateRef.current.messages.length === 0) return;

    toast({ title: "Archiving Conversation...", description: "This chat is being saved to the knowledge base." });
    
    const { default: jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');

    const tempContainer = document.createElement('div');
    tempContainer.style.width = '700px'; tempContainer.style.position = 'absolute'; tempContainer.style.left = '-9999px'; tempContainer.style.top = '-9999px'; tempContainer.style.fontFamily = 'Inter, sans-serif';

    const chatLogHtml = generateChatLogHtml(stateRef.current.messages, configRef.current.avatarSrc, "Chat Transcript");
    tempContainer.innerHTML = chatLogHtml;
    document.body.appendChild(tempContainer);

    try {
        await new Promise(resolve => setTimeout(resolve, 500));
        const canvas = await html2canvas(tempContainer, { scale: 2, useCORS: true, backgroundColor: '#FFFFFF', logging: false });
        document.body.removeChild(tempContainer);

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
        const pageMargin = 20; const contentWidth = pdf.internal.pageSize.getWidth() - (pageMargin * 2); const imgHeight = (canvas.height * contentWidth) / canvas.width;
        let heightLeft = imgHeight; let position = pageMargin;

        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', pageMargin, position, contentWidth, imgHeight);
        heightLeft -= (pdf.internal.pageSize.getHeight() - (pageMargin * 2));

        while (heightLeft > 0) {
            position = position - (pdf.internal.pageSize.getHeight() - (pageMargin * 2)) + pageMargin;
            pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', pageMargin, position, contentWidth, imgHeight);
            heightLeft -= (pdf.internal.pageSize.getHeight() - (pageMargin * 2));
        }

        const pdfBlob = pdf.output('blob');
        const sourceId = uuidv4();
        const timestamp = new Date().toISOString().split('T')[0];
        const fileName = `Chat-Transcript-${timestamp}-${sourceId.substring(0, 8)}.pdf`;

        const sourceDocRef = doc(db, 'kb_chat_history_meta_v1', sourceId);
        await setDoc(sourceDocRef, {
            sourceName: fileName, description: `Archived chat from ${new Date().toLocaleString()}`, topic: 'Chat History', level: 'Chat History',
            createdAt: new Date().toISOString(), indexingStatus: 'processing', indexingError: 'Uploading chat history PDF...', mimeType: 'application/pdf',
        });

        const storagePath = `chat_history_files/${sourceId}-${fileName}`;
        const fileRef = storageRef(storage, storagePath);
        await uploadBytes(fileRef, pdfBlob);
        const downloadURL = await getDownloadURL(fileRef);

        await updateDoc(sourceDocRef, { downloadURL, indexingError: 'Extracting text...' });

        const extractionResult = await extractTextFromDocument({ documentUrl: downloadURL });
        if (extractionResult.error || !extractionResult.extractedText?.trim()) { throw new Error(extractionResult.error || 'Text extraction failed.'); }

        await updateDoc(sourceDocRef, { indexingError: 'Indexing content...' });
        const indexingResult = await indexDocument({ sourceId, sourceName: fileName, text: extractionResult.extractedText, level: 'Chat History', topic: 'Chat History', downloadURL });
        if (!indexingResult.success) { throw new Error(indexingResult.error || 'Indexing failed.'); }

        toast({ title: "Conversation Archived", description: "Successfully saved to the knowledge base." });
    } catch (error: any) {
        console.error("Failed to archive and index chat:", error);
        toast({ title: "Archiving Failed", description: `Could not save chat to knowledge base: ${error.message}`, variant: "destructive" });
        if (tempContainer.parentElement) document.body.removeChild(tempContainer);
    }
  }, [toast]);


  const handleEndChatManually = useCallback(() => {
    stateRef.current.isEndingSession = true;
    if (stateRef.current.isListening) stopListeningAndProcess();
    if (stateRef.current.isSpeaking) {
      if (elevenLabsAudioRef.current) elevenLabsAudioRef.current.pause();
      window.speechSynthesis.cancel();
    }
    stateRef.current.hasConversationEnded = true;
    forceUpdate(c => c + 1);
  }, [stopListeningAndProcess]);
  
  useEffect(() => {
      if (stateRef.current.hasConversationEnded) {
          archiveAndIndexChat();
      }
  }, [stateRef.current.hasConversationEnded, archiveAndIndexChat]);

  const handleSaveConversationAsPdf = async () => {
    toast({ title: "Generating PDF...", description: "This may take a moment for long conversations." });
    
    const jsPDF = (await import('jspdf')).default; const html2canvas = (await import('html2canvas')).default;
    
    const tempContainer = document.createElement('div');
    tempContainer.style.width = '700px'; tempContainer.style.position = 'absolute'; tempContainer.style.left = '-9999px'; tempContainer.style.top = '-9999px'; tempContainer.style.fontFamily = 'Inter, sans-serif';

    const chatLogHtml = generateChatLogHtml(stateRef.current.messages, configRef.current.avatarSrc, uiText.chatLogTitle);
    tempContainer.innerHTML = chatLogHtml;
    document.body.appendChild(tempContainer);

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const canvas = await html2canvas(tempContainer, { scale: 2, useCORS: true, backgroundColor: '#FFFFFF', logging: false });
      document.body.removeChild(tempContainer);

      if (canvas.width === 0 || canvas.height === 0) {
         toast({ title: "Canvas Capture Error", description: "Captured canvas is empty. PDF cannot be generated.", variant: "destructive" });
         return;
      }
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageMargin = 20; const contentWidth = pdf.internal.pageSize.getWidth() - (pageMargin * 2); const imgHeight = (canvas.height * contentWidth) / canvas.width;
      let heightLeft = imgHeight; let position = pageMargin;

      pdf.addImage(imgData, 'PNG', pageMargin, position, contentWidth, imgHeight);
      heightLeft -= (pdf.internal.pageSize.getHeight() - (pageMargin * 2));

      while (heightLeft > 0) {
        position = position - (pdf.internal.pageSize.getHeight() - (pageMargin * 2)) + pageMargin;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', pageMargin, position, contentWidth, imgHeight);
        heightLeft -= (pdf.internal.pageSize.getHeight() - (pageMargin * 2));
      }

      pdf.save('AI-Blair-Conversation.pdf');
    } catch (error) {
      if (tempContainer.parentElement) document.body.removeChild(tempContainer);
      toast({ title: "PDF Generation Failed", description: "Could not save the conversation as PDF.", variant: "destructive" });
    }
  };

  const handleStartNewChat = () => { router.push('/'); };

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
        if (language === 'English') { setUiText(englishStrings); return; }
        const translatedEntries = await Promise.all(
            Object.entries(englishStrings).map(async ([key, value]) => [key, await translate(value)])
        );
        setUiText(Object.fromEntries(translatedEntries));
    };
    translateUi();
  }, [language, translate]);

  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoadingConfig(true);
      try {
        const [apiKeysSnap, siteAssetsSnap] = await Promise.all([
            getDoc(doc(db, FIRESTORE_API_KEYS_PATH)),
            getDoc(doc(db, FIRESTORE_SITE_ASSETS_PATH))
        ]);

        if (apiKeysSnap.exists()) {
          const keys = apiKeysSnap.data();
          configRef.current.elevenLabsApiKey = keys.tts || null;
          configRef.current.elevenLabsVoiceId = keys.voiceId || null;
          configRef.current.useTtsApi = typeof keys.useTtsApi === 'boolean' ? keys.useTtsApi : true;
        }
        if (siteAssetsSnap.exists()) {
          const assets = siteAssetsSnap.data();
          configRef.current.avatarSrc = assets.avatarUrl || DEFAULT_AVATAR_PLACEHOLDER_URL;
          configRef.current.animatedAvatarSrc = assets.animatedAvatarUrl || DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL;
          configRef.current.personaTraits = assets.personaTraits || DEFAULT_PERSONA_TRAITS;
          configRef.current.conversationalTopics = assets.conversationalTopics || DEFAULT_CONVERSATIONAL_TOPICS_MAIN_PAGE;
          configRef.current.splashScreenWelcomeMessage = assets.splashWelcomeMessage || DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE;
          configRef.current.customGreeting = assets.customGreetingMessage || DEFAULT_CUSTOM_GREETING_MAIN_PAGE;
          configRef.current.responsePauseTimeMs = assets.responsePauseTimeMs ?? DEFAULT_USER_SPEECH_PAUSE_TIME_MS;
          configRef.current.typingSpeedMs = assets.typingSpeedMs ?? DEFAULT_TYPING_SPEED_MS;
          configRef.current.animationSyncFactor = assets.animationSyncFactor ?? DEFAULT_ANIMATION_SYNC_FACTOR;
        }
      } catch (e) {
        toast({ title: "Config Error", description: `Could not load app settings. Using defaults.`, variant: "destructive" });
      } finally {
        setIsLoadingConfig(false);
      }
    };
    fetchAllData();
  }, [toast]);
  
  useEffect(() => {
    if (isLoadingConfig || stateRef.current.aiHasInitiatedConversation || stateRef.current.hasConversationEnded || stateRef.current.messages.length > 0) {
      return;
    }

    stateRef.current.aiHasInitiatedConversation = true;
    stateRef.current.showPreparingGreeting = true;
    forceUpdate(c => c + 1);
    
    const initConversation = async () => {
        let greetingToUse = configRef.current.customGreeting && configRef.current.customGreeting.trim() ? configRef.current.customGreeting.trim() : "";
        if (!greetingToUse) {
            try {
                const result = await generateChatResponse({
                    personaTraits: configRef.current.personaTraits, 
                    conversationalTopics: configRef.current.conversationalTopics, 
                    language, chatHistory: []
                });
                greetingToUse = result.aiResponse;
            } catch (error) {
                greetingToUse = language === 'Spanish' ? "Hola! ¿Como puedo ayudarte hoy?" : "Hello! How can I help you today?";
            }
        }
        if (language !== 'English' && configRef.current.customGreeting) {
          greetingToUse = await translate(greetingToUse);
        }
        
        let greetingMessageId: string | null = null;
        const onGreetingSpeechActuallyStarting = () => {
          greetingMessageId = addMessage(greetingToUse, 'model');
          currentAiMessageIdRef.current = greetingMessageId;
        };

        const audioDuration = await speakText(greetingToUse, greetingMessageId, onGreetingSpeechActuallyStarting, false);
        if (greetingMessageId && audioDuration > 0) updateMessageDuration(greetingMessageId, audioDuration);
        stateRef.current.showPreparingGreeting = false;
        forceUpdate(c => c + 1);
      };
      
      initConversation();
  }, [isLoadingConfig, language, addMessage, speakText, updateMessageDuration, translate]);

  let currentAvatarToDisplay = configRef.current.avatarSrc;
  let isDisplayingAnimatedAvatar = false;
  if (stateRef.current.isSpeaking && communicationMode !== 'text-only' && configRef.current.animatedAvatarSrc && configRef.current.animatedAvatarSrc !== DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL) {
    currentAvatarToDisplay = configRef.current.animatedAvatarSrc;
    isDisplayingAnimatedAvatar = true;
  }

  const imageProps: React.ComponentProps<typeof Image> = {
    src: currentAvatarToDisplay,
    alt: "AI Blair Avatar",
    width: communicationMode === 'audio-only' ? 200 : 120,
    height: communicationMode === 'audio-only' ? 200 : 120,
    className: cn(
      "rounded-full border-4 border-primary shadow-md object-cover transition-all duration-300",
       isDisplayingAnimatedAvatar ? "avatar-is-speaking-glow" : (stateRef.current.isSpeaking && "animate-pulse-speak")
    ),
    priority: true,
    unoptimized: true
  };
  
  const audioOnlyLiveIndicator = () => {
    if (stateRef.current.hasConversationEnded) return null;
    if (stateRef.current.showPreparingGreeting) return <div className="flex items-center justify-center rounded-lg bg-secondary p-3 text-secondary-foreground shadow animate-pulse"> <Loader2 size={20} className="mr-2 animate-spin" /> {uiText.preparingGreeting} </div>;
    if (stateRef.current.isListening) return <div className="flex items-center justify-center rounded-lg bg-accent p-3 text-accent-foreground shadow animate-pulse"> <Mic size={20} className="mr-2" /> {uiText.listening} </div>;
    if (stateRef.current.isSendingMessage && !stateRef.current.isSpeaking) return <div className="flex items-center justify-center rounded-lg bg-muted p-3 text-muted-foreground shadow animate-pulse font-bold text-lg text-primary"> {uiText.isPreparing} </div>;
    return null;
  };
  
  const { hasConversationEnded, messages, newlyAddedAiMessageId, forceFinishAnimationForMessageId, isSendingMessage, isSpeaking, showPreparingGreeting, isListening, inputValue } = stateRef.current;
  const messagesForLog = (communicationMode !== 'audio-only' && !hasConversationEnded)
    ? getVisibleChatBubbles(messages)
    : messages;

  const mainContent = () => {
    if (isLoadingConfig && !stateRef.current.aiHasInitiatedConversation) {
        return ( <div className="flex flex-col items-center justify-center h-full text-center py-8"> <DatabaseZap className="h-16 w-16 text-primary mb-6 animate-pulse" /> <h2 className="mt-6 text-3xl font-bold font-headline text-primary">{uiText.loadingConfig}</h2> <p className="mt-2 text-muted-foreground">{uiText.pleaseWait}</p> </div> );
    }
    if (communicationMode === 'audio-only') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center py-8">
          {!hasConversationEnded && <Image {...imageProps} alt="AI Blair Avatar" />}
          {!hasConversationEnded && <h2 className="mt-6 text-3xl font-bold font-headline text-primary">{configRef.current.splashScreenWelcomeMessage}</h2>}
           <div className={cn("mt-4 flex h-12 w-full items-center justify-center", hasConversationEnded && "hidden")}>
            {audioOnlyLiveIndicator()}
          </div>
          {hasConversationEnded && (
            <div className="w-full max-w-2xl mt-2 mb-4 flex-grow">
                 <h3 className="text-xl font-semibold mb-2 text-center">{uiText.conversationEnded}</h3>
                 <ConversationLog
                    messages={messages} avatarSrc={configRef.current.avatarSrc} typingSpeedMs={configRef.current.typingSpeedMs} animationSyncFactor={configRef.current.animationSyncFactor}
                    communicationMode={communicationMode} newlyAddedAiMessageId={newlyAddedAiMessageId} hasConversationEnded={hasConversationEnded} forceFinishAnimationForMessageId={forceFinishAnimationForMessageId}
                  />
                 <div className="mt-4 flex flex-col sm:flex-row justify-center items-center gap-3">
                    <Button onClick={handleSaveConversationAsPdf} variant="outline"> <Save className="mr-2 h-4 w-4" /> {uiText.saveAsPdf} </Button>
                    <Button onClick={handleStartNewChat} variant="outline"> <RotateCcw className="mr-2 h-4 w-4" /> {uiText.startNewChat} </Button>
                 </div>
            </div>
          )}
          {stateRef.current.aiHasInitiatedConversation && !hasConversationEnded && !showPreparingGreeting && !isSpeaking && !isSendingMessage && (
            <Button onClick={handleEndChatManually} variant="default" size="default" className="mt-8">
                <Power className="mr-2 h-5 w-5" /> {uiText.endChat}
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
              <Image {...imageProps} alt="AI Blair Avatar" />
              <h2 className="mt-4 text-2xl font-bold text-center font-headline text-primary">{configRef.current.splashScreenWelcomeMessage}</h2>
              {showPreparingGreeting && stateRef.current.aiHasInitiatedConversation && !hasConversationEnded && (
                <p className="mt-2 text-center text-sm font-semibold text-muted-foreground animate-pulse">{uiText.preparingGreeting}</p>
              )}
              {isSendingMessage && !isSpeaking && <p className="mt-2 text-center text-lg font-bold text-primary animate-pulse">{uiText.isTyping}</p>}
            </CardContent>
          </Card>
        </div>
        <div className="md:col-span-2 flex flex-col h-full">
          <ConversationLog
            messages={messagesForLog} avatarSrc={configRef.current.avatarSrc} typingSpeedMs={configRef.current.typingSpeedMs} animationSyncFactor={configRef.current.animationSyncFactor}
            communicationMode={communicationMode} newlyAddedAiMessageId={newlyAddedAiMessageId} hasConversationEnded={hasConversationEnded} forceFinishAnimationForMessageId={forceFinishAnimationForMessageId}
          />
          <MessageInput
            onSendMessage={handleSendMessage} isSending={isSendingMessage} isSpeaking={isSpeaking}
            showMicButton={communicationMode === 'audio-text'} isListening={isListening} onToggleListening={toggleListening}
            inputValue={inputValue} onInputValueChange={setInputValue}
            disabled={hasConversationEnded || showPreparingGreeting}
          />
          {hasConversationEnded ? (
             <div className="mt-4 flex flex-col sm:flex-row justify-end items-center gap-3">
                <Button onClick={handleSaveConversationAsPdf} variant="outline"> <Save className="mr-2 h-4 w-4" /> {uiText.saveAsPdf} </Button>
                <Button onClick={handleStartNewChat} variant="outline"> <RotateCcw className="mr-2 h-4 w-4" /> {uiText.startNewChat} </Button>
             </div>
          ) : stateRef.current.aiHasInitiatedConversation && (
             <div className="mt-3 flex justify-end">
                <Button onClick={handleEndChatManually} variant="outline" size="sm" disabled={showPreparingGreeting || isSendingMessage || isSpeaking}><Power className="mr-2 h-4 w-4" /> {uiText.endChat}</Button>
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

    