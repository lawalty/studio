
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
}

const DEFAULT_AVATAR_PLACEHOLDER_URL = "https://placehold.co/150x150.png";
const DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL = "https://placehold.co/150x150.png?text=GIF";
const DEFAULT_PERSONA_TRAITS = "You are AI Blair, a knowledgeable and helpful assistant specializing in the pawn store industry. You are professional, articulate, and provide clear, concise answers based on your knowledge base. Your tone is engaging and conversational.";
const DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE = "Welcome to AI Chat";
const DEFAULT_CONVERSATIONAL_TOPICS_MAIN_PAGE = "";
const DEFAULT_USER_SPEECH_PAUSE_TIME_MS = 750;


const FIRESTORE_API_KEYS_PATH = "configurations/api_keys_config";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";


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
    // Component State
    const [messages, setMessages] = useState<Message[]>([]);
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [hasConversationEnded, setHasConversationEnded] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [isLoadingConfig, setIsLoadingConfig] = useState(true);

    const messagesRef = useRef<Message[]>([]);
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Configuration State
    const configRef = useRef({
        avatarSrc: DEFAULT_AVATAR_PLACEHOLDER_URL,
        animatedAvatarSrc: DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL,
        personaTraits: DEFAULT_PERSONA_TRAITS,
        conversationalTopics: DEFAULT_CONVERSATIONAL_TOPICS_MAIN_PAGE,
        elevenLabsApiKey: null as string | null,
        elevenLabsVoiceId: null as string | null,
        useTtsApi: true,
        responsePauseTimeMs: DEFAULT_USER_SPEECH_PAUSE_TIME_MS,
        splashScreenWelcomeMessage: DEFAULT_SPLASH_WELCOME_MESSAGE_MAIN_PAGE,
    });

    // Refs for external APIs and timers
    const elevenLabsAudioRef = useRef<HTMLAudioElement | null>(null);
    const recognitionRef = useRef<any | null>(null);
    const speechRecognitionTimerRef = useRef<NodeJS.Timeout | null>(null);
    const finalTranscriptRef = useRef<string>(''); // Ref to hold transcript

    // Hooks
    const router = useRouter();
    const { language } = useLanguage();
    const { toast, dismiss: dismissAllToasts } = useToast();

    // UI Text (State for translations)
    const [uiText] = useState({
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

    const addMessage = useCallback((text: string, sender: 'user' | 'model', pdfReference?: Message['pdfReference']) => {
        const newMessage: Message = { id: uuidv4(), text, sender, timestamp: Date.now(), pdfReference };
        setMessages(prev => [...prev, newMessage]);
    }, []);
    
    const handleSendMessage = useCallback(async (text: string) => {
        if (text.trim() === '' || hasConversationEnded || isSendingMessage) return;

        if (isListening && recognitionRef.current) { try { recognitionRef.current.abort(); } catch(e) {/* ignore */} }
        if (speechRecognitionTimerRef.current) { clearTimeout(speechRecognitionTimerRef.current); speechRecognitionTimerRef.current = null; }
        
        addMessage(text, 'user');
        setInputValue('');
        setIsSendingMessage(true);
        
        const historyForGenkit = [...messagesRef.current, {id: 'temp', text, sender: 'user', timestamp: Date.now()}].map(msg => ({ 
            role: msg.sender as 'user' | 'model', 
            parts: [{ text: msg.text }] 
        }));

        try {
            const { personaTraits, conversationalTopics, useTtsApi, elevenLabsApiKey, elevenLabsVoiceId } = configRef.current;
            
            const cleanupAndResolve = () => {
                setIsSpeaking(false);
                if (elevenLabsAudioRef.current?.src.startsWith('blob:')) {
                    URL.revokeObjectURL(elevenLabsAudioRef.current.src);
                }
                if (elevenLabsAudioRef.current) elevenLabsAudioRef.current.src = '';
            };

            const speak = (textToSpeak: string) => {
                if (typeof window !== 'undefined') window.speechSynthesis.cancel();
                if (elevenLabsAudioRef.current) elevenLabsAudioRef.current.pause();
                
                if (communicationMode === 'text-only' || textToSpeak.trim() === "") {
                    cleanupAndResolve();
                    return;
                }
            
                const tryBrowserFallback = () => {
                    if (typeof window !== 'undefined' && window.speechSynthesis) {
                      const utterance = new SpeechSynthesisUtterance(textToSpeak.replace(/EZCORP/gi, "easy corp"));
                      utterance.onstart = () => setIsSpeaking(true);
                      utterance.onend = cleanupAndResolve;
                      utterance.onerror = (e) => {
                        console.error("Browser TTS Error:", e);
                        cleanupAndResolve();
                      };
                      window.speechSynthesis.speak(utterance);
                    } else {
                      cleanupAndResolve();
                    }
                };
                
                if (useTtsApi && elevenLabsApiKey && elevenLabsVoiceId) {
                    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`, { 
                        method: "POST", headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': elevenLabsApiKey }, 
                        body: JSON.stringify({ text: textToSpeak.replace(/EZCORP/gi, "easy corp"), model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
                    }).then(response => {
                        if (!response.ok) throw new Error(`API Error ${response.status}`);
                        return response.blob();
                    }).then(audioBlob => {
                        if (!elevenLabsAudioRef.current) elevenLabsAudioRef.current = new Audio();
                        const audio = elevenLabsAudioRef.current;
                        audio.src = URL.createObjectURL(audioBlob);
                        audio.onplay = () => setIsSpeaking(true);
                        audio.onended = cleanupAndResolve;
                        audio.onerror = (e) => {
                            console.error("ElevenLabs Audio Playback Error:", e);
                            tryBrowserFallback();
                        };
                        return audio.play();
                    }).catch(e => {
                        console.error("ElevenLabs API Error:", e);
                        tryBrowserFallback();
                    });
                } else {
                    tryBrowserFallback();
                }
            }
            
            const result: GenerateChatResponseOutput = await generateChatResponse({
                personaTraits, conversationalTopics,
                chatHistory: historyForGenkit,
                language: language,
            });

            addMessage(result.aiResponse, 'model', result.pdfReference);
            speak(result.aiResponse);

            if (result.shouldEndConversation) {
                setHasConversationEnded(true);
            }
            
        } catch (error) {
            console.error("Error in generateChatResponse:", error);
            const errorMessage = uiText.errorEncountered;
            addMessage(errorMessage, 'model');
        } finally {
            setIsSendingMessage(false);
        }
    }, [addMessage, communicationMode, hasConversationEnded, isListening, isSendingMessage, uiText.errorEncountered, language]);
    
    const archiveAndIndexChat = useCallback(async (msgs: Message[]) => {
        if (msgs.length === 0) return;

        toast({ title: "Archiving Conversation...", description: "This chat is being saved to the knowledge base." });
        
        const { default: jsPDF } = await import('jspdf');
        const { default: html2canvas } = await import('html2canvas');

        const tempContainer = document.createElement('div');
        tempContainer.style.width = '700px'; tempContainer.style.position = 'absolute'; tempContainer.style.left = '-9999px'; tempContainer.style.top = '-9999px'; tempContainer.style.fontFamily = 'Inter, sans-serif';

        const chatLogHtml = generateChatLogHtml(msgs, configRef.current.avatarSrc, "Chat Transcript");
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
            
            const textContentForIndexing = msgs.map(m => `${m.sender === 'user' ? 'User' : 'AI Blair'}: ${m.text}`).join('\n\n');

            await updateDoc(sourceDocRef, { indexingError: 'Indexing content...' });
            const indexingResult = await indexDocument({ sourceId, sourceName: fileName, text: textContentForIndexing, level: 'Chat History', topic: 'Chat History', downloadURL });
            if (!indexingResult.success) { throw new Error(indexingResult.error || 'Indexing failed.'); }

            toast({ title: "Conversation Archived", description: "Successfully saved to the knowledge base." });
        } catch (error: any) {
            console.error("Failed to archive and index chat:", error);
            toast({ title: "Archiving Failed", description: `Could not save chat to knowledge base: ${error.message}`, variant: "destructive" });
            if (tempContainer.parentElement) document.body.removeChild(tempContainer);
        }
    }, [toast]);
    
    // Effect for ending chat and archiving
    useEffect(() => {
        if (hasConversationEnded) {
            archiveAndIndexChat(messages);
        }
    }, [hasConversationEnded, messages, archiveAndIndexChat]);
    
    const stopListeningAndProcess = useCallback(() => {
        if (!isListening) return;
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
    }, [isListening]);

    const toggleListening = useCallback(() => {
        if (!recognitionRef.current && communicationMode !== 'text-only') {
          toast({ title: uiText.micNotReadyTitle, description: uiText.micNotReadyDesc, variant: "destructive" });
          return;
        }
        
        if (isListening) {
          stopListeningAndProcess();
        } else {
          if (hasConversationEnded || isSpeaking || isSendingMessage) return;
          try {
            finalTranscriptRef.current = '';
            recognitionRef.current?.start();
            setIsListening(true);
          } catch (startError: any) {
            if (startError.name !== 'InvalidStateError' && startError.name !== 'AbortError') {
              toast({ variant: 'destructive', title: uiText.micErrorTitle, description: uiText.micErrorDesc.replace('{error}', `${startError.name}: ${startError.message || 'Could not start microphone.'}`) });
            }
            setIsListening(false);
          }
        }
    }, [communicationMode, hasConversationEnded, isListening, isSendingMessage, isSpeaking, stopListeningAndProcess, toast, uiText]);
    
    // Effect for speech recognition setup
    useEffect(() => {
        if (typeof window === 'undefined' || communicationMode === 'text-only') return;

        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) {
            toast({ title: uiText.micNotReadyTitle, description: uiText.micNotReadyDesc, variant: "destructive" });
            return;
        }
        const recognition = new SpeechRecognitionAPI();
        recognitionRef.current = recognition;
        
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language === 'Spanish' ? 'es-MX' : 'en-US';

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          finalTranscriptRef.current += finalTranscript;
          setInputValue(interimTranscript);
          
          if (speechRecognitionTimerRef.current) clearTimeout(speechRecognitionTimerRef.current);
          speechRecognitionTimerRef.current = setTimeout(() => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
          }, configRef.current.responsePauseTimeMs);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.onerror = (event: any) => {
          setIsListening(false);
          if (!['no-speech', 'aborted', 'network'].includes(event.error)) {
            toast({ title: uiText.micErrorTitle, description: event.error, variant: 'destructive' });
          }
        };

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
            if (speechRecognitionTimerRef.current) {
                clearTimeout(speechRecognitionTimerRef.current);
            }
        };
    }, [communicationMode, toast, uiText, language]);
    
    // New Effect to handle sending the message after listening stops
    useEffect(() => {
        if (!isListening && finalTranscriptRef.current.trim()) {
            handleSendMessage(finalTranscriptRef.current.trim());
            finalTranscriptRef.current = ''; // Clear the ref after sending
        }
    }, [isListening, handleSendMessage]);
    
    // Effect for initial data load - NOW RUNS ONLY ONCE
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
              configRef.current.responsePauseTimeMs = assets.responsePauseTimeMs ?? DEFAULT_USER_SPEECH_PAUSE_TIME_MS;
            }
          } catch (e) {
            toast({ title: "Config Error", description: `Could not load app settings. Using defaults.`, variant: "destructive" });
          } finally {
            setIsLoadingConfig(false);
          }
        };
        fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty dependency array ensures this runs only ONCE.
    
    // Component lifecycle cleanup
    useEffect(() => {
        return () => {
            dismissAllToasts();
            if (speechRecognitionTimerRef.current) clearTimeout(speechRecognitionTimerRef.current);
            if (recognitionRef.current) try { recognitionRef.current.abort(); } catch(e) { /* ignore */ }
            if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
            if (elevenLabsAudioRef.current) {
                if (elevenLabsAudioRef.current.src && !elevenLabsAudioRef.current.paused) {
                    elevenLabsAudioRef.current.pause();
                    if (elevenLabsAudioRef.current.src.startsWith('blob:')) {
                        URL.revokeObjectURL(elevenLabsAudioRef.current.src);
                    }
                }
                elevenLabsAudioRef.current.src = '';
            }
        };
    }, [dismissAllToasts]);

    const handleEndChatManually = useCallback(() => {
        if (isListening) stopListeningAndProcess();
        if (isSpeaking) {
          if (elevenLabsAudioRef.current) elevenLabsAudioRef.current.pause();
          window.speechSynthesis.cancel();
        }
        setHasConversationEnded(true);
    }, [isListening, isSpeaking, stopListeningAndProcess]);

    const handleSaveConversationAsPdf = async () => {
        toast({ title: "Generating PDF...", description: "This may take a moment for long conversations." });
        
        const jsPDF = (await import('jspdf')).default; const html2canvas = (await import('html2canvas')).default;
        
        const tempContainer = document.createElement('div');
        tempContainer.style.width = '700px'; tempContainer.style.position = 'absolute'; tempContainer.style.left = '-9999px'; tempContainer.style.top = '-9999px'; tempContainer.style.fontFamily = 'Inter, sans-serif';

        const chatLogHtml = generateChatLogHtml(messages, configRef.current.avatarSrc, uiText.chatLogTitle);
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
    
    // UI Rendering Logic
    let currentAvatarToDisplay = configRef.current.avatarSrc;
    let isDisplayingAnimatedAvatar = false;

    const animatedAvatarSrc = configRef.current.animatedAvatarSrc;
    if (isSpeaking && communicationMode !== 'text-only' && animatedAvatarSrc && animatedAvatarSrc !== DEFAULT_ANIMATED_AVATAR_PLACEHOLDER_URL) {
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
         isDisplayingAnimatedAvatar ? "avatar-is-speaking-glow" : (isSpeaking && "animate-pulse-speak")
      ),
      priority: true,
      unoptimized: true
    };
    
    const audioOnlyLiveIndicator = () => {
      if (hasConversationEnded) return null;
      if (isListening) return <div className="flex items-center justify-center rounded-lg bg-accent p-3 text-accent-foreground shadow animate-pulse"> <Mic size={20} className="mr-2" /> {uiText.listening} </div>;
      if (isSendingMessage && !isSpeaking) return <div className="flex items-center justify-center rounded-lg bg-muted p-3 text-muted-foreground shadow animate-pulse font-bold text-lg text-primary"> {uiText.isPreparing} </div>;
      return null;
    };
    
    const messagesForLog = (communicationMode !== 'audio-only' && !hasConversationEnded)
      ? getVisibleChatBubbles(messages)
      : messages;

    const mainContent = () => {
      if (isLoadingConfig) {
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
                      messages={messages} avatarSrc={configRef.current.avatarSrc}
                    />
                   <div className="mt-4 flex flex-col sm:flex-row justify-center items-center gap-3">
                      <Button onClick={handleSaveConversationAsPdf} variant="outline"> <Save className="mr-2 h-4 w-4" /> {uiText.saveAsPdf} </Button>
                      <Button onClick={() => router.push('/')} variant="outline"> <RotateCcw className="mr-2 h-4 w-4" /> {uiText.startNewChat} </Button>
                   </div>
              </div>
            )}
            {!hasConversationEnded && !isSpeaking && !isSendingMessage && (
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
                {isSendingMessage && !isSpeaking && <p className="mt-2 text-center text-lg font-bold text-primary animate-pulse">{uiText.isTyping}</p>}
              </CardContent>
            </Card>
          </div>
          <div className="md:col-span-2 flex flex-col h-full">
            <ConversationLog
              messages={messagesForLog} avatarSrc={configRef.current.avatarSrc}
            />
            <MessageInput
              onSendMessage={handleSendMessage} isSending={isSendingMessage} isSpeaking={isSpeaking}
              showMicButton={communicationMode === 'audio-text'} isListening={isListening} onToggleListening={toggleListening}
              inputValue={inputValue} onInputValueChange={setInputValue}
              disabled={hasConversationEnded}
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
    };

    return (
      <div className="flex flex-col h-full">
        <div className="flex-grow">
          {mainContent()}
        </div>
      </div>
    );
}
