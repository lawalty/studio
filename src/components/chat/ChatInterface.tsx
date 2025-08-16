
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ConversationLog from '@/components/chat/ConversationLog';
import MessageInput from '@/components/chat/MessageInput';
import { generateChatResponse, type GenerateChatResponseInput, type GenerateChatResponseOutput } from '@/ai/flows/generate-chat-response';
import { indexDocument } from '@/ai/flows/index-document-flow';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Mic, Power, DatabaseZap, Save, RotateCcw, Square, Loader2 } from 'lucide-react';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useLanguage } from '@/context/LanguageContext';
import { v4 as uuidv4 } from 'uuid';
import { textToSpeech as googleTextToSpeech } from '@/ai/flows/text-to-speech-flow';
import { generateInitialGreeting } from '@/ai/flows/generate-initial-greeting';
import { elevenLabsTextToSpeech } from '@/ai/flows/eleven-labs-tts-flow';


export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'model';
  timestamp: number;
  pdfReference?: {
    fileName: string;
    downloadURL: string;
  };
  distance?: number;
  distanceThreshold?: number;
  formality?: number;
  conciseness?: number;
  tone?: number;
  formatting?: number;
}

const DEFAULT_AVATAR_PLACEHOLDER_URL = "https://placehold.co/150x150.png";
const DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL = "https://placehold.co/150x150.png?text=GIF";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const FIRESTORE_APP_CONFIG_PATH = "configurations/app_config";
const DEFAULT_TYPING_SPEED_MS = 40;
const DEFAULT_ANIMATION_SYNC_FACTOR = 0.9;
const DEFAULT_STYLE_VALUE = 50;

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

const getVisibleChatBubbles = (allMessages: Message[], animatedMessage?: Message): Message[] => {
    if (animatedMessage) {
        return [...allMessages, animatedMessage];
    }
    return allMessages;
};


interface ChatInterfaceProps {
    communicationMode: 'audio-only' | 'audio-text' | 'text-only';
}

type BotStatus = 'idle' | 'listening' | 'preparing' | 'speaking' | 'typing';

interface ChatConfig {
    avatarSrc: string;
    animatedAvatarSrc: string;
    personaTraits: string;
    personalBio: string;
    conversationalTopics: string;
    splashScreenWelcomeMessage: string;
    responsePauseTimeMs: number;
    inactivityTimeoutMs: number;
    customGreetingMessage: string;
    useKnowledgeInGreeting: boolean;
    typingSpeedMs: number;
    animationSyncFactor: number;
    ttsApiKey: string;
    ttsVoiceId: string;
    useCustomTts: boolean;
    archiveChatHistoryEnabled: boolean;
}

export default function ChatInterface({ communicationMode }: ChatInterfaceProps) {
    // Component readiness state
    const [isReady, setIsReady] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    
    // Dynamic conversational state
    const [messages, setMessages] = useState<Message[]>([]);
    const [botStatus, setBotStatus] = useState<BotStatus>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const [hasConversationEnded, setHasConversationEnded] = useState(false);
    const [endedDueToInactivity, setEndedDueToInactivity] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [animatedResponse, setAnimatedResponse] = useState<Message | null>(null);
    const [uiMessage, setUiMessage] = useState<string>('');
    const [clarificationAttemptCount, setClarificationAttemptCount] = useState(0);

    const [config, setConfig] = useState<ChatConfig>({
        avatarSrc: DEFAULT_AVATAR_PLACEHOLDER_URL,
        animatedAvatarSrc: DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL,
        personaTraits: "",
        personalBio: "",
        conversationalTopics: "",
        splashScreenWelcomeMessage: "Welcome to AI Chat",
        responsePauseTimeMs: 1500,
        inactivityTimeoutMs: 30000,
        customGreetingMessage: "",
        useKnowledgeInGreeting: true,
        typingSpeedMs: DEFAULT_TYPING_SPEED_MS,
        animationSyncFactor: DEFAULT_ANIMATION_SYNC_FACTOR,
        ttsApiKey: '',
        ttsVoiceId: '',
        useCustomTts: false,
        archiveChatHistoryEnabled: true,
    });
    
    // Refs for stable storage across renders
    const messagesRef = useRef<Message[]>([]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);

    const inactivityCheckLevelRef = useRef(0);
    
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
    const recognitionRef = useRef<any | null>(null);
    const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
    const speechPauseTimerRef = useRef<NodeJS.Timeout | null>(null);
    const finalTranscriptRef = useRef<string>('');
    const animationTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isMountedRef = useRef(true);

    // Hooks
    const router = useRouter();
    const { language, translate } = useLanguage();
    const { toast, dismiss: dismissAllToasts } = useToast();
    
    const uiText = useMemo(() => ({
        loadingConfig: "Loading Chat Configuration...",
        isPreparing: "is preparing",
        isListening: "is listening",
        isTyping: "is typing",
        isSpeaking: "is speaking",
        conversationEnded: "Conversation Ended",
        saveAsPdf: "Save as PDF",
        startNewChat: "Start New Chat",
        endChat: "End Chat",
        micErrorTitle: "Microphone Error",
        micErrorDesc: "Could not start microphone.",
        errorEncountered: "Sorry, I encountered an error. Please try again.",
        chatLogTitle: "Chat with AI Blair",
        inactivityPrompt: "Are you still there?",
        inactivityPromptInitial: "Is anyone there?",
        inactivityPromptSecondary: "Hello, are you still there?",
        inactivityEndMessage: "It sounds like no one is available, so I'll end our conversation now. Feel free to start a new chat anytime!"
    }), []);

    const isBotProcessing = botStatus === 'preparing';
    const isBotSpeaking = botStatus === 'speaking' || botStatus === 'typing';
    const isListening = botStatus === 'listening';

    // Functions are declared here
    const addMessage = useCallback((message: Omit<Message, 'id' | 'timestamp'>) => {
        const newMessage: Message = { ...message, id: uuidv4(), timestamp: Date.now() };
        setMessages(prev => [...prev, newMessage]);
    }, []);

    const logErrorToFirestore = useCallback(async (error: any, source: string) => {
        try {
            await addDoc(collection(db, "site_errors"), {
                message: error.message || "An unknown error occurred.",
                source: source,
                timestamp: new Date(),
                details: JSON.stringify(error, Object.getOwnPropertyNames(error))
            });
        } catch (dbError) {
            console.error("CRITICAL: Failed to log error to Firestore.", dbError);
        }
    }, []);
    
    const clearInactivityTimer = useCallback(() => {
        if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current);
            inactivityTimerRef.current = null;
        }
    }, []);

    const toggleListening = useCallback(() => {
        if (!recognitionRef.current || !isMountedRef.current) return;
        const isCurrentlyListening = botStatus === 'listening';
    
        if (isCurrentlyListening) {
            recognitionRef.current.stop();
        } else if (!hasConversationEnded) {
            try {
                setBotStatus('listening');
                setStatusMessage(uiText.isListening);
                setInputValue('');
                finalTranscriptRef.current = '';
                recognitionRef.current.start();
            } catch (e: any) {
                if (e.name !== 'invalid-state') { 
                    console.error("Mic start error:", e);
                    logErrorToFirestore(e, 'ChatInterface/toggleListening/start');
                    setBotStatus('idle');
                    setStatusMessage('');
                }
            }
        }
    }, [botStatus, hasConversationEnded, logErrorToFirestore, uiText.isListening]);

    const handleEndChatManually = useCallback(async (reason?: 'final-inactive') => {
        clearInactivityTimer();
        if (botStatus === 'listening') { recognitionRef.current?.stop(); }
        if (audioPlayerRef.current) { audioPlayerRef.current.pause(); }
        if (typeof window !== 'undefined') { window.speechSynthesis.cancel(); }
        
        setBotStatus('idle');
        setStatusMessage('');
        
        if (reason === 'final-inactive') {
            setEndedDueToInactivity(true);
        } else {
            setEndedDueToInactivity(false);
        }
        setHasConversationEnded(true);
    }, [botStatus, clearInactivityTimer]);
    
    const speakText = useCallback(async (textToSpeak: string, fullMessage: Message, onSpeechEnd?: () => void) => {
        if (!audioPlayerRef.current) audioPlayerRef.current = new Audio();
        if (!isMountedRef.current || !textToSpeak.trim()) {
            onSpeechEnd?.();
            return;
        }
        
        if (typeof window !== 'undefined') window.speechSynthesis.cancel();
        if (animationTimerRef.current) clearTimeout(animationTimerRef.current);

        const processedText = textToSpeak.replace(/\bCOO\b/gi, 'Chief Operating Officer').replace(/\bEZCORP\b/gi, 'easy corp');

        const handleEnd = () => {
            if (!isMountedRef.current) return;
            if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
            setAnimatedResponse(null);
            addMessage(fullMessage);
            onSpeechEnd?.();
        };

        let audioDataUri = '';
        if (communicationMode !== 'text-only') {
            try {
                const { useCustomTts, ttsApiKey, ttsVoiceId } = config;
                if (useCustomTts && ttsApiKey && ttsVoiceId) {
                    const result = await elevenLabsTextToSpeech({ text: processedText, apiKey: ttsApiKey, voiceId: ttsVoiceId });
                    if (result.error || !result.media) throw new Error(result.error || "Custom TTS failed to return media.");
                    audioDataUri = result.media;
                } else {
                    const result = await googleTextToSpeech(processedText);
                    audioDataUri = result.media;
                }
            } catch (ttsError: any) {
                console.error("TTS API Error:", ttsError);
                await logErrorToFirestore(ttsError, 'ChatInterface/speakText/TTS');
                handleEnd();
                return;
            }
        }

        const targetStatus = communicationMode === 'text-only' ? 'typing' : 'speaking';
        
        const playAndAnimate = async () => {
            setBotStatus(targetStatus);
            setStatusMessage(targetStatus === 'speaking' ? uiText.isSpeaking : uiText.isTyping);
            
            if (communicationMode !== 'audio-only') {
                const getAnimationDuration = (): Promise<number> => {
                    return new Promise((resolve) => {
                        if (communicationMode === 'text-only' || !audioDataUri) {
                            resolve(fullMessage.text.length * config.typingSpeedMs); return;
                        }
                        const audioEl = new Audio(); audioEl.src = audioDataUri;
                        const resolveOnce = (duration: number) => { audioEl.onloadedmetadata = null; audioEl.onerror = null; resolve(duration); };
                        audioEl.onloadedmetadata = () => {
                            const durationInMs = (audioEl.duration || 0) * 1000;
                            const adjustedDuration = isFinite(durationInMs) ? durationInMs * config.animationSyncFactor : (fullMessage.text.length * 50);
                            resolveOnce(adjustedDuration);
                        };
                        audioEl.onerror = () => resolveOnce(fullMessage.text.length * 50);
                        setTimeout(() => resolveOnce(fullMessage.text.length * 50), 5000);
                    });
                };

                setAnimatedResponse({ ...fullMessage, text: '' });
                const totalAnimationDuration = await getAnimationDuration();
                const textLength = fullMessage.text.length;
                const delayPerChar = textLength > 0 ? totalAnimationDuration / textLength : 0;
                
                let currentIndex = 0;
                const typeCharacter = () => {
                    if (!isMountedRef.current) return;
                    if (currentIndex < textLength) {
                        setAnimatedResponse(prev => prev ? { ...prev, text: fullMessage.text.substring(0, currentIndex + 1) } : null);
                        currentIndex++;
                        animationTimerRef.current = setTimeout(typeCharacter, delayPerChar);
                    } else if (communicationMode === 'text-only') {
                        handleEnd();
                    }
                };
                typeCharacter();
            }
            
            if (audioDataUri && communicationMode !== 'text-only' && audioPlayerRef.current) {
                audioPlayerRef.current.src = audioDataUri;
                audioPlayerRef.current.onended = handleEnd;
                audioPlayerRef.current.play().catch(e => { console.error("Audio playback failed:", e); handleEnd(); });
            } else if (audioDataUri && communicationMode === 'audio-only' && audioPlayerRef.current) {
                audioPlayerRef.current.onended = () => { addMessage(fullMessage); onSpeechEnd?.(); };
                audioPlayerRef.current.src = audioDataUri;
                audioPlayerRef.current.play().catch(e => { console.error("Audio playback failed:", e); addMessage(fullMessage); onSpeechEnd?.(); });
            } else if (communicationMode === 'text-only') {
                 // Already handled by animation end
            } else {
                handleEnd();
            }
        };
        
        playAndAnimate();
    }, [communicationMode, addMessage, logErrorToFirestore, uiText, config]);
    
    const startInactivityTimer = useCallback(() => {
        if (communicationMode !== 'audio-only' || hasConversationEnded) return;
        clearInactivityTimer();
    
        const runCheck = async () => {
            if (!isMountedRef.current || botStatus !== 'listening') return;
            
            recognitionRef.current?.stop();
            
            inactivityCheckLevelRef.current += 1;
            let promptText;
            if (inactivityCheckLevelRef.current === 1) {
                const hasUserResponded = messagesRef.current.some(m => m.sender === 'user');
                promptText = hasUserResponded ? uiText.inactivityPrompt : uiText.inactivityPromptInitial;
            } else if (inactivityCheckLevelRef.current === 2) {
                promptText = uiText.inactivityPromptSecondary;
            } else {
                const translatedEndMessage = await translate(uiText.inactivityEndMessage);
                const finalMessage: Message = { id: uuidv4(), text: translatedEndMessage, sender: 'model', timestamp: Date.now() };
                
                speakText(translatedEndMessage, finalMessage, () => {
                    handleEndChatManually('final-inactive');
                });
                return;
            }
            
            setBotStatus('preparing');
            setStatusMessage(uiText.isPreparing);
            const translatedPrompt = await translate(promptText);
            const promptMessage: Message = { id: uuidv4(), text: translatedPrompt, sender: 'model', timestamp: Date.now() };
            
            speakText(translatedPrompt, promptMessage, () => {
                setBotStatus('idle');
            });
        };
    
        inactivityTimerRef.current = setTimeout(runCheck, config.inactivityTimeoutMs);
    }, [communicationMode, hasConversationEnded, botStatus, clearInactivityTimer, uiText, translate, config, handleEndChatManually, speakText]);

    const handleSendMessage = useCallback(async (text: string) => {
        if (!text.trim() || hasConversationEnded || isBotProcessing) return;

        clearInactivityTimer();
        inactivityCheckLevelRef.current = 0; // Reset on user activity
        addMessage({ text, sender: 'user' });
        setInputValue('');
        setBotStatus('preparing');
        setStatusMessage(uiText.isPreparing);
        
        const historyForGenkit = [...messagesRef.current, {id: 'temp', text, sender: 'user', timestamp: Date.now()}].map(msg => ({ 
            role: msg.sender as 'user' | 'model', 
            parts: [{ text: msg.text }] 
        }));

        try {
            const { 
                personaTraits, 
                personalBio,
                conversationalTopics,
            } = config;
            const flowInput: GenerateChatResponseInput = {
                personaTraits,
                personalBio,
                conversationalTopics,
                chatHistory: historyForGenkit,
                language: language,
                clarificationAttemptCount: clarificationAttemptCount,
            };
            const result = await generateChatResponse(flowInput);

            if (result.isClarificationQuestion) {
                setClarificationAttemptCount(prev => prev + 1);
            } else {
                setClarificationAttemptCount(0); // Reset on a direct answer
            }
            
            const aiMessage: Message = {
                id: uuidv4(),
                text: result.aiResponse,
                sender: 'model',
                timestamp: Date.now(),
                pdfReference: result.pdfReference,
                distance: result.distance,
                distanceThreshold: result.distanceThreshold,
                formality: result.formality,
                conciseness: result.conciseness,
                tone: result.tone,
                formatting: result.formatting,
            };
            
            await speakText(result.aiResponse, aiMessage, () => {
                if (result.shouldEndConversation) {
                    handleEndChatManually();
                } else if (!hasConversationEnded) {
                    setBotStatus('idle');
                    setStatusMessage('');
                }
            });

        } catch (error: any) {
            console.error("Error in generateChatResponse:", error);
            await logErrorToFirestore(error, 'ChatInterface/handleSendMessage');
            const errorMessage = "I'm having a little trouble connecting right now. Please try again in a moment.";
            const translatedError = await translate(errorMessage);
            addMessage({ text: translatedError, sender: 'model'});
            setBotStatus('idle');
            setStatusMessage('');
        }
    }, [hasConversationEnded, isBotProcessing, clearInactivityTimer, addMessage, uiText.isPreparing, language, clarificationAttemptCount, logErrorToFirestore, translate, config, speakText, handleEndChatManually]);
    
    const archiveAndIndexChat = useCallback(async (msgs: Message[]) => {
        // Do not archive if no user messages, or if archiving is disabled.
        const hasUserMessages = msgs.some(m => m.sender === 'user');
        if (msgs.length === 0 || !config.archiveChatHistoryEnabled || !hasUserMessages) return;
        
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: html2canvas } = await import('html2canvas');
            const tempContainer = document.createElement('div');
            tempContainer.style.width = '700px'; tempContainer.style.position = 'absolute'; tempContainer.style.left = '-9999px'; tempContainer.style.fontFamily = 'Inter, sans-serif';
            tempContainer.innerHTML = generateChatLogHtml(msgs, config.avatarSrc, "Chat Transcript");
            document.body.appendChild(tempContainer);
            await new Promise(resolve => setTimeout(resolve, 500));
            const canvas = await html2canvas(tempContainer, { scale: 2, useCORS: true, backgroundColor: '#FFFFFF', logging: false });
            document.body.removeChild(tempContainer);
            
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
            const pageMargin = 20; const contentWidth = pdf.internal.pageSize.getWidth() - (pageMargin * 2); const imgHeight = (canvas.height * contentWidth) / canvas.width;
            let heightLeft = imgHeight; let position = pageMargin;

            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', pageMargin, position, contentWidth, imgHeight);
            heightLeft -= (pdf.internal.pageSize.getHeight() - (pageMargin * 2));
            while (heightLeft > 0) {
                position -= (pdf.internal.pageSize.getHeight() - pageMargin);
                pdf.addPage();
                pdf.addImage(canvas.toDataURL('image/png'), 'PNG', pageMargin, position, contentWidth, imgHeight);
                heightLeft -= (pdf.internal.pageSize.getHeight() - (pageMargin * 2));
            }
            const pdfBlob = pdf.output('blob');
            
            const sourceId = uuidv4();
            const fileName = `Chat-Transcript-${new Date().toISOString().split('T')[0]}.pdf`;
            const sourceDocRef = doc(db, 'kb_meta', sourceId);
            await setDoc(sourceDocRef, { sourceName: fileName, topic: 'Chat History', level: 'Chat History', createdAt: new Date().toISOString(), indexingStatus: 'processing', mimeType: 'application/pdf' });
            
            const storagePath = `knowledge_base_files/Chat History/${sourceId}-${fileName}`;
            await uploadBytes(storageRef(storage, storagePath), pdfBlob);
            const downloadURL = await getDownloadURL(storageRef(storage, storagePath));
            await updateDoc(sourceDocRef, { downloadURL });

            const textContentForIndexing = msgs.map(m => `${m.sender}: ${m.text}`).join('\n\n');
            const indexingResult = await indexDocument({ sourceId, sourceName: fileName, text: textContentForIndexing, level: 'Chat History', topic: 'Chat History', downloadURL });
            if (!indexingResult.success) throw new Error(indexingResult.error || 'Indexing failed.');

        } catch (error: any) {
            console.error("Failed to archive chat:", error);
            await logErrorToFirestore(error, 'ChatInterface/archiveAndIndexChat');
        }
    }, [logErrorToFirestore, config]);
    
    useEffect(() => {
        if (hasConversationEnded) {
            clearInactivityTimer();
            if (!endedDueToInactivity) {
                archiveAndIndexChat(messages);
            }
        }
    }, [hasConversationEnded, messages, archiveAndIndexChat, clearInactivityTimer, endedDueToInactivity]);
    
    useEffect(() => {
        isMountedRef.current = true;
        const fetchAllData = async () => {
          try {
            const siteAssetsSnap = await getDoc(doc(db, FIRESTORE_SITE_ASSETS_PATH));
            const appConfigSnap = await getDoc(doc(db, FIRESTORE_APP_CONFIG_PATH));

            if (isMountedRef.current) {
                const assets = siteAssetsSnap.exists() ? siteAssetsSnap.data() : {};
                const appConfigData = appConfigSnap.exists() ? appConfigSnap.data() : {};

                const newConfig = {
                    avatarSrc: assets.avatarUrl || DEFAULT_AVATAR_PLACEHOLDER_URL,
                    animatedAvatarSrc: assets.animatedAvatarUrl || DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL,
                    personaTraits: assets.personaTraits || "You are IA Blair v2, a knowledgeable and helpful assistant.",
                    personalBio: assets.personalBio || "I am an AI assistant.",
                    conversationalTopics: assets.conversationalTopics || "",
                    splashScreenWelcomeMessage: assets.splashScreenWelcomeMessage || "Welcome to AI Chat",
                    responsePauseTimeMs: assets.responsePauseTimeMs ?? 1500,
                    inactivityTimeoutMs: assets.inactivityTimeoutMs ?? 30000,
                    customGreetingMessage: assets.customGreetingMessage || "",
                    useKnowledgeInGreeting: typeof assets.useKnowledgeInGreeting === 'boolean' ? assets.useKnowledgeInGreeting : true,
                    typingSpeedMs: assets.typingSpeedMs ?? DEFAULT_TYPING_SPEED_MS,
                    animationSyncFactor: assets.animationSyncFactor ?? DEFAULT_ANIMATION_SYNC_FACTOR,
                    ttsApiKey: appConfigData.tts || '',
                    ttsVoiceId: appConfigData.voiceId || '',
                    useCustomTts: typeof appConfigData.useTtsApi === 'boolean' ? appConfigData.useTtsApi : false,
                    archiveChatHistoryEnabled: assets.archiveChatHistoryEnabled === undefined ? true : assets.archiveChatHistoryEnabled,
                };
                setConfig(newConfig);
                setUiMessage(newConfig.splashScreenWelcomeMessage);
            }
          } catch (e: any) {
            await logErrorToFirestore(e, 'ChatInterface/fetchAllData');
          } finally {
            if (isMountedRef.current) {
                setIsReady(true);
            }
          }
        };
        fetchAllData();

        return () => {
            isMountedRef.current = false;
            dismissAllToasts();
            clearInactivityTimer();
            if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
            if (speechPauseTimerRef.current) clearTimeout(speechPauseTimerRef.current);
            if (recognitionRef.current) try { recognitionRef.current.abort(); } catch(e) { /* ignore */ }
            if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
            if (audioPlayerRef.current) {
                audioPlayerRef.current.onended = null;
                audioPlayerRef.current.pause();
                audioPlayerRef.current.src = '';
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!isReady || isInitialized || messages.length > 0) return;
        
        const sendInitialGreeting = async () => {
            setBotStatus('preparing');
            setStatusMessage(uiText.isPreparing);
            let greetingText = "Hello! How can I help you today?"; 
            try {
                const { customGreetingMessage, useKnowledgeInGreeting, personaTraits, conversationalTopics } = config;
                let textToTranslate = customGreetingMessage || "Hello! How can I help you today?";
                if (!customGreetingMessage) {
                    const result = await generateInitialGreeting({ personaTraits, conversationalTopics, useKnowledgeInGreeting, language: 'English' });
                    textToTranslate = result.greeting;
                }
                greetingText = await translate(textToTranslate);
                const greetingMessage: Message = { id: uuidv4(), text: greetingText, sender: 'model', timestamp: Date.now() };
                
                await speakText(greetingText, greetingMessage, () => {
                    setBotStatus('idle');
                    setStatusMessage('');
                });
            } catch (error: any) {
                console.error("Error generating or sending initial greeting:", error);
                await logErrorToFirestore(error, 'ChatInterface/sendInitialGreeting');
                const fallbackMessage: Message = { id: uuidv4(), text: greetingText, sender: 'model', timestamp: Date.now() };
                await speakText(greetingText, fallbackMessage, () => {
                     setBotStatus('idle');
                     setStatusMessage('');
                });
            }
        };
        
        sendInitialGreeting();
        setIsInitialized(true); 

    }, [isReady, isInitialized, messages.length, translate, speakText, logErrorToFirestore, communicationMode, uiText, config]);
    
    // This effect is responsible for setting up and tearing down the speech recognition object.
    useEffect(() => {
        if (!isReady || !['audio-only', 'audio-text'].includes(communicationMode)) return;

        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) {
            console.warn("Speech Recognition API is not supported in this browser.");
            return;
        }
        
        recognitionRef.current = new SpeechRecognitionAPI();
        const recognition = recognitionRef.current;
        recognition.continuous = true;
        recognition.interimResults = true;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, [isReady, communicationMode]);
    
    // This effect updates the recognition object's event handlers whenever their dependencies change.
    // This prevents stale closures.
    useEffect(() => {
        if (!recognitionRef.current) return;

        recognitionRef.current.lang = language === 'Spanish' ? 'es-MX' : 'en-US';

        recognitionRef.current.onstart = () => {
            if (!isMountedRef.current) return;
            setBotStatus('listening');
            setStatusMessage(uiText.isListening);
            if (speechPauseTimerRef.current) clearTimeout(speechPauseTimerRef.current);
            if (communicationMode === 'audio-only') {
                 startInactivityTimer();
            }
        };
        
        recognitionRef.current.onend = () => {
          if (!isMountedRef.current || botStatus === 'preparing') return;
          
          if (botStatus === 'listening') {
              const finalTranscript = finalTranscriptRef.current.trim();
              if (finalTranscript) {
                  setBotStatus('idle'); 
                  setStatusMessage('');
                  handleSendMessage(finalTranscript);
              } else {
                  setBotStatus('idle');
                  setStatusMessage('');
              }
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          if (!isMountedRef.current) return;
          setBotStatus('idle');
          setStatusMessage('');
          if (!['no-speech', 'aborted', 'not-allowed'].includes(event.error)) {
            logErrorToFirestore(event.error, 'ChatInterface/SpeechRecognition');
          }
        };

        recognitionRef.current.onresult = (event: any) => {
          if (!isMountedRef.current) return;
          
          if (speechPauseTimerRef.current) clearTimeout(speechPauseTimerRef.current);
          clearInactivityTimer();
          inactivityCheckLevelRef.current = 0; // Reset on any speech result

          let interim_transcript = '';
          finalTranscriptRef.current = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscriptRef.current += event.results[i][0].transcript + ' ';
            } else {
              interim_transcript += event.results[i][0].transcript;
            }
          }
          
          setInputValue(finalTranscriptRef.current + interim_transcript);
          
          speechPauseTimerRef.current = setTimeout(() => {
            if (recognitionRef.current && botStatus === 'listening') {
                recognitionRef.current.stop();
            }
          }, config.responsePauseTimeMs);
        };
    }, [language, handleSendMessage, clearInactivityTimer, startInactivityTimer, botStatus, uiText.isListening, logErrorToFirestore, communicationMode, config]);
    
    useEffect(() => {
        if (botStatus === 'idle' && isInitialized && communicationMode === 'audio-only' && !hasConversationEnded) {
            toggleListening();
        }
    }, [botStatus, isInitialized, communicationMode, hasConversationEnded, toggleListening]);


    const handleSaveConversationAsPdf = async () => {
        toast({ title: "Generating PDF..." });
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: html2canvas } = await import('html2canvas');
            const tempContainer = document.createElement('div');
            tempContainer.style.width = '700px'; tempContainer.style.position = 'absolute'; tempContainer.style.left = '-9999px'; tempContainer.style.fontFamily = 'Inter, sans-serif';
            tempContainer.innerHTML = generateChatLogHtml(messages, config.avatarSrc, uiText.chatLogTitle);
            document.body.appendChild(tempContainer);
            await new Promise(resolve => setTimeout(resolve, 500));
            const canvas = await html2canvas(tempContainer, { scale: 2, useCORS: true, backgroundColor: '#FFFFFF', logging: false });
            document.body.removeChild(tempContainer);
            
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
            const pageMargin = 20; const contentWidth = pdf.internal.pageSize.getWidth() - (pageMargin * 2); const imgHeight = (canvas.height * contentWidth) / canvas.width;
            let heightLeft = imgHeight; let position = pageMargin;

            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', pageMargin, position, contentWidth, imgHeight);
            heightLeft -= (pdf.internal.pageSize.getHeight() - (pageMargin * 2));
            while (heightLeft > 0) {
                position -= (pdf.internal.pageSize.getHeight() - pageMargin);
                pdf.addPage();
                pdf.addImage(canvas.toDataURL('image/png'), 'PNG', pageMargin, position, contentWidth, imgHeight);
                heightLeft -= (pdf.internal.pageSize.getHeight() - (pageMargin * 2));
            }
            pdf.save('AI-Blair-Conversation.pdf');
        } catch (error: any) {
          await logErrorToFirestore(error, 'ChatInterface/handleSaveConversationAsPdf');
          toast({ title: "PDF Generation Failed", variant: "destructive" });
        }
    };
    
    const imageProps: React.ComponentProps<typeof Image> = {
      src: (isBotSpeaking && config.animatedAvatarSrc !== DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL) ? config.animatedAvatarSrc : config.avatarSrc,
      alt: "AI Blair Avatar",
      width: communicationMode === 'audio-only' ? 200 : 120,
      height: communicationMode === 'audio-only' ? 200 : 120,
      className: cn("rounded-full border-4 border-primary shadow-md object-cover transition-all duration-300", 
        (isBotSpeaking) && "animate-pulse-speak"
      ),
      priority: true,
      unoptimized: true
    };
    
    if (!isReady) {
        return ( <div className="flex flex-col items-center justify-center h-full text-center"> <DatabaseZap className="h-16 w-16 text-primary mb-6 animate-pulse" /> <h2 className="mt-6 text-3xl font-bold font-headline text-primary">{uiText.loadingConfig}</h2></div> );
    }

    if (communicationMode === 'audio-only') {
      return (
        <div className="flex flex-col h-full items-center justify-center text-center">
            <div className="flex flex-col items-center space-y-6">
                <h2 className="text-2xl font-bold font-headline text-primary">
                {uiMessage}
                </h2>
                {!hasConversationEnded ? (
                <div className="flex flex-col items-center space-y-6">
                    <Image {...imageProps} alt="AI Blair Avatar" />
                    <div className="flex h-16 w-full items-center justify-center">
                    {statusMessage && (
                        <div className={cn("flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-accent-foreground shadow", (isListening || isBotProcessing) && "animate-pulse")}>
                            {isListening ? <Mic size={20} className="mr-2" /> : <Loader2 size={20} className="mr-2 animate-spin" />}
                            {statusMessage}
                        </div>
                    )}
                    </div>
                    <Button onClick={() => handleEndChatManually()} variant="outline" size="sm" disabled={isBotProcessing || isBotSpeaking}>
                    <Power className="mr-2 h-4 w-4" /> {uiText.endChat}
                    </Button>
                </div>
                ) : (
                <div className="w-full max-w-2xl mt-2 mb-4 flex-grow text-left">
                    <h3 className="text-xl font-semibold mb-2 text-center">{uiText.conversationEnded}</h3>
                    <ConversationLog messages={messages} avatarSrc={config.avatarSrc} />
                    <div className="mt-4 flex flex-col sm:flex-row justify-center items-center gap-3">
                        <Button onClick={handleSaveConversationAsPdf} variant="outline"> <Save className="mr-2 h-4 w-4" /> {uiText.saveAsPdf} </Button>
                        <Button onClick={() => router.push('/')} variant="outline"> <RotateCcw className="mr-2 h-4 w-4" /> {uiText.startNewChat} </Button>
                    </div>
                </div>
                )}
            </div>
        </div>
      );
    }
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
        <div className="md:col-span-1 flex flex-col items-center md:items-start space-y-4">
          <Card className="w-full shadow-xl">
            <CardContent className="pt-6 flex flex-col items-center">
               <h2 className="mb-4 text-2xl font-bold text-center font-headline text-primary">{uiMessage}</h2>
              <Image {...imageProps} alt="AI Blair Avatar" />
                {statusMessage && (
                  <p className="mt-2 text-center text-lg font-bold text-primary animate-pulse">{statusMessage}</p>
                )}
            </CardContent>
          </Card>
        </div>
        <div className="md:col-span-2 flex flex-col h-full min-h-0">
          <div className="flex-grow min-h-0">
            <ConversationLog messages={getVisibleChatBubbles(messages, animatedResponse ?? undefined)} avatarSrc={config.avatarSrc} />
          </div>
          <MessageInput
            onSendMessage={(text) => handleSendMessage(text)} isSending={isBotProcessing || isBotSpeaking} isSpeaking={isBotSpeaking}
            showMicButton={communicationMode === 'audio-text'} isListening={isListening} onToggleListening={toggleListening}
            inputValue={inputValue} onInputValueChange={setInputValue} disabled={hasConversationEnded}
          />
          {hasConversationEnded ? (
             <div className="mt-4 flex flex-col sm:flex-row justify-end items-center gap-3">
                <Button onClick={handleSaveConversationAsPdf} variant="outline"> <Save className="mr-2 h-4 w-4" /> {uiText.saveAsPdf} </Button>
                <Button onClick={() => router.push('/')} variant="outline"> <RotateCcw className="mr-2 h-4 w-4" /> {uiText.startNewChat} </Button>
             </div>
          ) : (
             <div className="mt-3 flex justify-end">
                <Button onClick={() => handleEndChatManually()} variant="outline" size="sm" disabled={isBotProcessing || isBotSpeaking}><Power className="mr-2 h-4 w-4" /> {uiText.endChat}</Button>
             </div>
          )}
        </div>
      </div>
    );
}
