
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Mic, Power, DatabaseZap, Save, RotateCcw, Square } from 'lucide-react';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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
}

const DEFAULT_AVATAR_PLACEHOLDER_URL = "https://placehold.co/150x150.png";
const DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL = "https://placehold.co/150x150.png?text=GIF";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";
const DEFAULT_TYPING_SPEED_MS = 40;
const DEFAULT_ANIMATION_SYNC_FACTOR = 0.9;

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
        // If there's an animated message, we need to show the previous user message and the animating AI message.
        const userMessages = allMessages.filter(m => m.sender === 'user');
        const lastUserMessage = userMessages[userMessages.length - 1];
        return lastUserMessage ? [lastUserMessage, animatedMessage] : [animatedMessage];
    }
    
    // Default logic for showing the last turn
    if (allMessages.length < 2) return allMessages;
    const lastMessage = allMessages[allMessages.length - 1];
    const secondLastMessage = allMessages[allMessages.length - 2];
    if (lastMessage.sender === 'model' && secondLastMessage.sender === 'user') {
        return [secondLastMessage, lastMessage];
    }
    return [lastMessage];
};


interface ChatInterfaceProps {
    communicationMode: 'audio-only' | 'audio-text' | 'text-only';
}

export default function ChatInterface({ communicationMode }: ChatInterfaceProps) {
    // Component readiness state
    const [isReady, setIsReady] = useState(false);
    
    // Dynamic conversational state
    const [messages, setMessages] = useState<Message[]>([]);
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [hasConversationEnded, setHasConversationEnded] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [animatedResponse, setAnimatedResponse] = useState<Message | null>(null);
    
    // Refs for stable storage across renders
    const messagesRef = useRef<Message[]>([]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);

    const configRef = useRef({
        avatarSrc: DEFAULT_AVATAR_PLACEHOLDER_URL,
        animatedAvatarSrc: DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL,
        personaTraits: "You are IA Blair v2, a knowledgeable and helpful assistant.",
        conversationalTopics: "",
        splashScreenWelcomeMessage: "Welcome to AI Chat",
        responsePauseTimeMs: 750,
        customGreetingMessage: "",
        useKnowledgeInGreeting: true,
        typingSpeedMs: DEFAULT_TYPING_SPEED_MS,
        animationSyncFactor: DEFAULT_ANIMATION_SYNC_FACTOR,
        ttsApiKey: '',
        ttsVoiceId: '',
        useCustomTts: false,
    });
    
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
    const recognitionRef = useRef<any | null>(null);
    const speechRecognitionTimerRef = useRef<NodeJS.Timeout | null>(null);
    const finalTranscriptRef = useRef<string>('');
    const animationTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Hooks
    const router = useRouter();
    const { language } = useLanguage();
    const { toast, dismiss: dismissAllToasts } = useToast();
    
    // UI Text (static)
    const uiText = {
        loadingConfig: "Loading Chat Configuration...",
        listening: "Listening...",
        isPreparing: "AI Blair is preparing...",
        isTyping: "AI Blair is typing...",
        conversationEnded: "Conversation Ended",
        saveAsPdf: "Save as PDF",
        startNewChat: "Start New Chat",
        endChat: "End Chat",
        micErrorTitle: "Microphone Error",
        micErrorDesc: "Could not start microphone.",
        errorEncountered: "Sorry, I encountered an error. Please try again.",
        chatLogTitle: "Chat with AI Blair"
    };

    const addMessage = useCallback((text: string, sender: 'user' | 'model', pdfReference?: Message['pdfReference']) => {
        const newMessage: Message = { id: uuidv4(), text, sender, timestamp: Date.now(), pdfReference };
        setMessages(prev => [...prev, newMessage]);
    }, []);
    
    const speakText = useCallback(async (textToSpeak: string, fullMessage: Message) => {
        if (!textToSpeak.trim()) return;

        // Pre-process text for correct pronunciation before sending to any API.
        const processedText = textToSpeak
          .replace(/\bCOO\b/gi, 'Chief Operating Officer')
          .replace(/\bEZCORP\b/gi, 'easy corp');
    
        const useAudio = communicationMode !== 'text-only';
    
        if (useAudio) {
            if (typeof window !== 'undefined') window.speechSynthesis.cancel();
            if (audioPlayerRef.current) audioPlayerRef.current.pause();
        }
    
        let audioDuration = fullMessage.text.length * configRef.current.typingSpeedMs;
        let audioDataUri = '';

        if (useAudio) {
            try {
                const { useCustomTts, ttsApiKey, ttsVoiceId } = configRef.current;
                if (useCustomTts && ttsApiKey && ttsVoiceId) {
                    const result = await elevenLabsTextToSpeech({ text: processedText, apiKey: ttsApiKey, voiceId: ttsVoiceId });
                    if (result.error || !result.media) {
                        toast({ title: "Custom TTS Error", description: result.error, variant: 'destructive' });
                        const googleResult = await googleTextToSpeech(processedText);
                        audioDataUri = googleResult.media;
                    } else {
                        audioDataUri = result.media;
                    }
                } else {
                    const result = await googleTextToSpeech(processedText);
                    audioDataUri = result.media;
                }

                if (!audioPlayerRef.current) {
                    audioPlayerRef.current = new Audio();
                    audioPlayerRef.current.onended = () => {
                        setIsSpeaking(false);
                        if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
                        setAnimatedResponse(null);
                        addMessage(fullMessage.text, 'model', fullMessage.pdfReference);
                    };
                }
                audioPlayerRef.current.src = audioDataUri;
    
                const audioPromise = new Promise<void>(resolve => {
                    audioPlayerRef.current!.onloadedmetadata = () => {
                        const duration = audioPlayerRef.current!.duration;
                        if (isFinite(duration)) {
                            audioDuration = duration * 1000 * configRef.current.animationSyncFactor;
                        }
                        resolve();
                    };
                    audioPlayerRef.current!.onerror = () => resolve();
                });
    
                await audioPromise;
                setIsSpeaking(true);
                await audioPlayerRef.current.play();
    
            } catch (e) {
                console.error("TTS API Error:", e);
                setIsSpeaking(false);
            }
        } else {
            setIsSpeaking(true);
        }
    
        if (communicationMode !== 'audio-only') {
            const textLength = fullMessage.text.length;
            const delayPerChar = textLength > 0 ? audioDuration / textLength : 0;
            let currentIndex = 0;
            
            setAnimatedResponse({ ...fullMessage, text: '' });
    
            const typeCharacter = () => {
                if (currentIndex < textLength) {
                    setAnimatedResponse(prev => prev ? { ...prev, text: fullMessage.text.substring(0, currentIndex + 1) } : null);
                    currentIndex++;
                    animationTimerRef.current = setTimeout(typeCharacter, delayPerChar);
                } else {
                    setIsSpeaking(false);
                    setAnimatedResponse(null);
                    addMessage(fullMessage.text, 'model', fullMessage.pdfReference);
                }
            };
            typeCharacter();
        } else {
             addMessage(fullMessage.text, 'model', fullMessage.pdfReference);
        }
    
    }, [communicationMode, addMessage, configRef, toast]);


    const handleSendMessage = useCallback(async (text: string) => {
        if (!text.trim() || hasConversationEnded || isSendingMessage) return;

        addMessage(text, 'user');
        setInputValue('');
        setIsSendingMessage(true);
        
        const historyForGenkit = [...messagesRef.current, {id: 'temp', text, sender: 'user', timestamp: Date.now()}].map(msg => ({ 
            role: msg.sender as 'user' | 'model', 
            parts: [{ text: msg.text }] 
        }));

        try {
            const { personaTraits, conversationalTopics } = configRef.current;
            const result = await generateChatResponse({
                personaTraits, conversationalTopics,
                chatHistory: historyForGenkit,
                language: language,
            });
            
            const aiMessage: Message = {
                id: uuidv4(),
                text: result.aiResponse,
                sender: 'model',
                timestamp: Date.now(),
                pdfReference: result.pdfReference
            };
            
            setIsSendingMessage(false);
            await speakText(result.aiResponse, aiMessage);

            if (result.shouldEndConversation) setHasConversationEnded(true);
            
        } catch (error) {
            console.error("Error in generateChatResponse:", error);
            addMessage(uiText.errorEncountered, 'model');
            setIsSendingMessage(false);
        }
    }, [addMessage, hasConversationEnded, isSendingMessage, language, speakText, uiText.errorEncountered]);
    
    const archiveAndIndexChat = useCallback(async (msgs: Message[]) => {
        if (msgs.length === 0) return;
        toast({ title: "Archiving Conversation..." });
        
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: html2canvas } = await import('html2canvas');
            const tempContainer = document.createElement('div');
            tempContainer.style.width = '700px'; tempContainer.style.position = 'absolute'; tempContainer.style.left = '-9999px'; tempContainer.style.fontFamily = 'Inter, sans-serif';
            tempContainer.innerHTML = generateChatLogHtml(msgs, configRef.current.avatarSrc, "Chat Transcript");
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
            const sourceDocRef = doc(db, 'kb_chat_history_meta_v1', sourceId);
            await setDoc(sourceDocRef, { sourceName: fileName, topic: 'Chat History', level: 'Chat History', createdAt: new Date().toISOString(), indexingStatus: 'processing', mimeType: 'application/pdf' });
            
            const storagePath = `chat_history_files/${sourceId}-${fileName}`;
            await uploadBytes(storageRef(storage, storagePath), pdfBlob);
            const downloadURL = await getDownloadURL(storageRef(storage, storagePath));
            await updateDoc(sourceDocRef, { downloadURL });

            const textContentForIndexing = msgs.map(m => `${m.sender}: ${m.text}`).join('\n\n');
            const indexingResult = await indexDocument({ sourceId, sourceName: fileName, text: textContentForIndexing, level: 'Chat History', topic: 'Chat History', downloadURL });
            if (!indexingResult.success) throw new Error(indexingResult.error || 'Indexing failed.');

            toast({ title: "Conversation Archived" });
        } catch (error: any) {
            console.error("Failed to archive chat:", error);
            toast({ title: "Archiving Failed", description: error.message, variant: "destructive" });
        }
    }, [toast]);
    
    useEffect(() => {
        if (hasConversationEnded) archiveAndIndexChat(messages);
    }, [hasConversationEnded, messages, archiveAndIndexChat]);
    
    // ONE-TIME Effect for initial data load and setup.
    useEffect(() => {
        let isMounted = true;
        const fetchAllData = async () => {
          try {
            const siteAssetsSnap = await getDoc(doc(db, FIRESTORE_SITE_ASSETS_PATH));
            const keysSnap = await getDoc(doc(db, FIRESTORE_KEYS_PATH));

            if (isMounted) {
                const assets = siteAssetsSnap.exists() ? siteAssetsSnap.data() : {};
                const keys = keysSnap.exists() ? keysSnap.data() : {};

                configRef.current = {
                    avatarSrc: assets.avatarUrl || DEFAULT_AVATAR_PLACEHOLDER_URL,
                    animatedAvatarSrc: assets.animatedAvatarUrl || DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL,
                    personaTraits: assets.personaTraits || configRef.current.personaTraits,
                    conversationalTopics: assets.conversationalTopics || "",
                    splashScreenWelcomeMessage: assets.splashScreenWelcomeMessage || configRef.current.splashScreenWelcomeMessage,
                    responsePauseTimeMs: assets.responsePauseTimeMs || configRef.current.responsePauseTimeMs,
                    customGreetingMessage: assets.customGreetingMessage || "",
                    useKnowledgeInGreeting: typeof assets.useKnowledgeInGreeting === 'boolean' ? assets.useKnowledgeInGreeting : true,
                    typingSpeedMs: assets.typingSpeedMs ?? DEFAULT_TYPING_SPEED_MS,
                    animationSyncFactor: assets.animationSyncFactor ?? DEFAULT_ANIMATION_SYNC_FACTOR,
                    ttsApiKey: keys.tts || '',
                    ttsVoiceId: keys.voiceId || '',
                    useCustomTts: typeof keys.useTtsApi === 'boolean' ? keys.useTtsApi : false,
                };
            }
          } catch (e) {
            toast({ title: "Config Error", description: `Could not load app settings. Using defaults.`, variant: "destructive" });
          } finally {
            if (isMounted) {
                setIsReady(true);
            }
          }
        };
        fetchAllData();

        return () => { // Cleanup on unmount
            isMounted = false;
            dismissAllToasts();
            if (speechRecognitionTimerRef.current) clearTimeout(speechRecognitionTimerRef.current);
            if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
            if (recognitionRef.current) try { recognitionRef.current.abort(); } catch(e) { /* ignore */ }
            if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
            if (audioPlayerRef.current) {
                audioPlayerRef.current.pause();
                audioPlayerRef.current.src = '';
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Effect to send initial greeting
    useEffect(() => {
        if (isReady && messages.length === 0) {
            const sendInitialGreeting = async () => {
                setIsSendingMessage(true);
                let greetingText = "Hello! How can I help you today?"; // Default fallback

                try {
                    const { 
                        customGreetingMessage, 
                        useKnowledgeInGreeting, 
                        personaTraits, 
                        conversationalTopics 
                    } = configRef.current;

                    if (customGreetingMessage) {
                        greetingText = customGreetingMessage;
                    } else {
                        // Call the AI to generate a greeting
                        const result = await generateInitialGreeting({
                            personaTraits,
                            conversationalTopics,
                            useKnowledgeInGreeting,
                            language,
                        });
                        greetingText = result.greeting;
                    }
                    
                    const greetingMessage: Message = {
                        id: uuidv4(),
                        text: greetingText,
                        sender: 'model',
                        timestamp: Date.now()
                    };

                    setIsSendingMessage(false);
                    await speakText(greetingText, greetingMessage);

                } catch (error) {
                    console.error("Error generating or sending initial greeting:", error);
                    // Use the default fallback greeting on error
                    const fallbackMessage: Message = {
                        id: uuidv4(),
                        text: greetingText,
                        sender: 'model',
                        timestamp: Date.now()
                    };
                    setIsSendingMessage(false);
                    await speakText(greetingText, fallbackMessage);
                }
            };
            sendInitialGreeting();
        }
    }, [isReady, messages.length, language, speakText]);
    
    // Effect for speech recognition setup
    useEffect(() => {
        if (!isReady || communicationMode === 'text-only') return;

        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) return;
        
        const recognition = new SpeechRecognitionAPI();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language === 'Spanish' ? 'es-MX' : 'en-US';

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => {
            setIsListening(false);
            if (finalTranscriptRef.current.trim()) handleSendMessage(finalTranscriptRef.current.trim());
            finalTranscriptRef.current = '';
        };
        recognition.onerror = (event: any) => {
          setIsListening(false);
          if (!['no-speech', 'aborted'].includes(event.error)) {
            toast({ title: uiText.micErrorTitle, description: event.error, variant: 'destructive' });
          }
        };
        recognition.onresult = (event: any) => {
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
          }
          if (finalTranscript) finalTranscriptRef.current += finalTranscript;
          
          if (speechRecognitionTimerRef.current) clearTimeout(speechRecognitionTimerRef.current);
          speechRecognitionTimerRef.current = setTimeout(() => {
            if (recognitionRef.current) recognitionRef.current.stop();
          }, configRef.current.responsePauseTimeMs);
        };
    }, [isReady, communicationMode, language, handleSendMessage, toast, uiText.micErrorTitle]);

    const toggleListening = useCallback(() => {
        if (isListening) {
            recognitionRef.current?.stop();
        } else if (!hasConversationEnded && !isSpeaking && !isSendingMessage) {
            try {
                finalTranscriptRef.current = '';
                recognitionRef.current?.start();
            } catch (e) {
                toast({ variant: 'destructive', title: uiText.micErrorTitle, description: uiText.micErrorDesc });
            }
        }
    }, [isListening, hasConversationEnded, isSpeaking, isSendingMessage, toast, uiText.micErrorDesc, uiText.micErrorTitle]);

    const handleEndChatManually = useCallback(() => {
        if (isListening) recognitionRef.current?.stop();
        if (isSpeaking) {
          if (audioPlayerRef.current) audioPlayerRef.current.pause();
          window.speechSynthesis.cancel();
        }
        setHasConversationEnded(true);
    }, [isListening, isSpeaking]);

    const handleSaveConversationAsPdf = async () => {
        toast({ title: "Generating PDF..." });
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: html2canvas } = await import('html2canvas');
            const tempContainer = document.createElement('div');
            tempContainer.style.width = '700px'; tempContainer.style.position = 'absolute'; tempContainer.style.left = '-9999px'; tempContainer.style.fontFamily = 'Inter, sans-serif';
            tempContainer.innerHTML = generateChatLogHtml(messages, configRef.current.avatarSrc, uiText.chatLogTitle);
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
        } catch (error) {
          toast({ title: "PDF Generation Failed", variant: "destructive" });
        }
    };
    
    const imageProps: React.ComponentProps<typeof Image> = {
      src: (isSpeaking && communicationMode !== 'text-only' && configRef.current.animatedAvatarSrc !== DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL) ? configRef.current.animatedAvatarSrc : configRef.current.avatarSrc,
      alt: "AI Blair Avatar",
      width: communicationMode === 'audio-only' ? 200 : 120,
      height: communicationMode === 'audio-only' ? 200 : 120,
      className: cn("rounded-full border-4 border-primary shadow-md object-cover transition-all duration-300", 
        (isSpeaking && communicationMode !== 'text-only') && "animate-pulse-speak"
      ),
      priority: true,
      unoptimized: true
    };
    
    if (!isReady) {
        return ( <div className="flex flex-col items-center justify-center h-full text-center py-8"> <DatabaseZap className="h-16 w-16 text-primary mb-6 animate-pulse" /> <h2 className="mt-6 text-3xl font-bold font-headline text-primary">{uiText.loadingConfig}</h2></div> );
    }

    if (communicationMode === 'audio-only') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center py-8 space-y-6">
          {!hasConversationEnded ? (
            <>
              <Image {...imageProps} alt="AI Blair Avatar" />
              <h2 className="text-2xl font-bold font-headline text-primary">
                {configRef.current.splashScreenWelcomeMessage}
              </h2>
              <div className="flex h-16 w-full items-center justify-center">
                 {isSendingMessage ? (
                    <div className="font-bold text-lg text-primary animate-pulse">{uiText.isPreparing}</div>
                 ) : isListening ? (
                    <div className="flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-accent-foreground shadow animate-pulse">
                        <Mic size={20} className="mr-2" /> {uiText.listening}
                    </div>
                 ) : isSpeaking ? null : (
                   <Button onClick={toggleListening} variant="default" size="lg" className="h-16 w-16 rounded-full animate-pulse">
                     <Mic className="h-8 w-8" />
                   </Button>
                 )}
              </div>
               <Button onClick={handleEndChatManually} variant="outline" size="sm" disabled={isSpeaking || isSendingMessage}>
                 <Power className="mr-2 h-4 w-4" /> {uiText.endChat}
               </Button>
            </>
          ) : (
            <div className="w-full max-w-2xl mt-2 mb-4 flex-grow">
                 <h3 className="text-xl font-semibold mb-2 text-center">{uiText.conversationEnded}</h3>
                 <ConversationLog messages={messages} avatarSrc={configRef.current.avatarSrc} />
                 <div className="mt-4 flex flex-col sm:flex-row justify-center items-center gap-3">
                    <Button onClick={handleSaveConversationAsPdf} variant="outline"> <Save className="mr-2 h-4 w-4" /> {uiText.saveAsPdf} </Button>
                    <Button onClick={() => router.push('/')} variant="outline"> <RotateCcw className="mr-2 h-4 w-4" /> {uiText.startNewChat} </Button>
                 </div>
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
              <Image {...imageProps} alt="AI Blair Avatar" />
              <h2 className="mt-4 text-2xl font-bold text-center font-headline text-primary">{configRef.current.splashScreenWelcomeMessage}</h2>
              {(isSpeaking || (isSendingMessage && !isSpeaking)) && <p className="mt-2 text-center text-lg font-bold text-primary animate-pulse">{uiText.isTyping}</p>}
            </CardContent>
          </Card>
        </div>
        <div className="md:col-span-2 flex flex-col h-full">
          <ConversationLog messages={getVisibleChatBubbles(messages, animatedResponse ?? undefined)} avatarSrc={configRef.current.avatarSrc} />
          <MessageInput
            onSendMessage={handleSendMessage} isSending={isSendingMessage} isSpeaking={isSpeaking}
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
                <Button onClick={handleEndChatManually} variant="outline" size="sm" disabled={isSendingMessage || isSpeaking}><Power className="mr-2 h-4 w-4" /> {uiText.endChat}</Button>
             </div>
          )}
        </div>
      </div>
    );
}

    
