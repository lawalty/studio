
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
const DEFAULT_AVATAR_SRC = "https://placehold.co/300x300.png";
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
  const [avatarSrc, setAvatarSrc] = useState<string>(DEFAULT_AVATAR_SRC);
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

  const toggleListeningRef = useRef<(forceState?: boolean) => void>(() => {});
  const speakTextRef = useRef<(text: string) => Promise<void>>(async () => {});
  const handleSendMessageRef = useRef<(text: string, method: 'text' | 'voice') => Promise<void>>(async () => {});
  const isEndingSessionRef = useRef(false);


  const addMessage = useCallback((text: string, sender: 'user' | 'ai') => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: Date.now().toString() + Math.random(), text, sender, timestamp: Date.now() },
    ]);
  }, []);

  const toggleListening = useCallback((forceState?: boolean) => {
    setIsListening(currentIsListening => {
      const targetState = typeof forceState === 'boolean' ? forceState : !currentIsListening;

      if (targetState === true) { // Trying to start listening
        if (!recognitionRef.current) {
          if (communicationModeRef.current === 'audio-only' || communicationModeRef.current === 'audio-text') {
            toast({ title: "Mic Not Supported", description: "Speech recognition is not initialized.", variant: "destructive" });
          }
          return false;
        }
        if (isSpeakingRef.current && forceState !== false) { // Don't start listening if AI is speaking, unless explicitly told to stop
            toast({ title: "Please Wait", description: "AI Blair is currently speaking.", variant: "default" });
            return false;
        }
        if (communicationModeRef.current === 'text-only') {
           // Don't enable listening in text-only mode.
           return false;
        }
      }
      // For stopping listening, or if checks passed for starting:
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
    setIsSendingMessage(false); // Ensure sending message spinner stops once audio starts
  }, [setIsSpeaking, setIsSendingMessage]);


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
        if (elevenLabsAudioRef.current.src.startsWith('blob:')) { // Check if it's a blob URL
            URL.revokeObjectURL(elevenLabsAudioRef.current.src);
        }
      }
      elevenLabsAudioRef.current.src = ''; // Clear src
      elevenLabsAudioRef.current.onplay = null;
      elevenLabsAudioRef.current.onended = null;
      elevenLabsAudioRef.current.onerror = null;
      elevenLabsAudioRef.current = null; // Release the reference
    }

    // Ensure browser speech synthesis is stopped
    if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);

    // Ensure speech recognition is stopped
    if (recognitionRef.current) {
      recognitionRef.current.abort(); // Use abort for more immediate stop
    }
    setIsListening(false); // Ensure listening state is false
  }, [setMessages, setIsSendingMessage, setAiHasInitiatedConversation, setInputValue, setConsecutiveSilencePrompts, setIsSpeaking, setIsListening, setShowLogForSaveConfirmation, setShowSaveDialog]);

  const handleAudioProcessEnd = useCallback((audioPlayedSuccessfully: boolean) => {
    setIsSpeaking(false);

    if (isEndingSessionRef.current) {
      isEndingSessionRef.current = false; // Reset flag
      resetConversation();
      setShowSplashScreen(true);
      return; // Exit early, session is ending
    }

    // Fallback: if audio didn't play but we had text, ensure it's in messages
    if (!audioPlayedSuccessfully && currentAiResponseTextRef.current) {
       // Check if this specific message (by text content and sender) is already there
       if (!messages.find(m => m.text === currentAiResponseTextRef.current && m.sender === 'ai')) {
            addMessage(currentAiResponseTextRef.current, 'ai');
       }
    }
    setIsSendingMessage(false); // Ensure this is reset

    // Cleanup ElevenLabs audio object if it exists
    if (elevenLabsAudioRef.current) {
      if (elevenLabsAudioRef.current.src && elevenLabsAudioRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(elevenLabsAudioRef.current.src);
      }
      // Detach event handlers to prevent memory leaks or unintended behavior
      elevenLabsAudioRef.current.onplay = null;
      elevenLabsAudioRef.current.onended = null;
      elevenLabsAudioRef.current.onerror = null;
      elevenLabsAudioRef.current = null; // Release the reference
    }

    // Re-engage listening in audio-only mode if AI just finished speaking
    // and the session isn't flagged to end.
    if (communicationModeRef.current === 'audio-only') {
      setTimeout(() => {
        if (isSpeakingRef.current) {
          // AI has started speaking again in the interim (e.g., another error prompt)
          console.log("Audio-only mode: AI is still speaking (or started again), deferring auto-listen trigger.");
          return;
        }
        if (!isEndingSessionRef.current) { // Double check session isn't ending
            toggleListeningRef.current(true);
        }
      }, 1500); // Slightly longer delay might be more robust
    }
  }, [addMessage, messages, resetConversation, setShowSplashScreen, setIsSpeaking, setIsSendingMessage]);


  const browserSpeakInternal = useCallback((text: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (window.speechSynthesis.speaking) window.speechSynthesis.cancel(); // Stop any current speech
      const utterance = new SpeechSynthesisUtterance(text);
      // Optionally configure pitch, rate, voice here if needed
      utterance.pitch = 1; utterance.rate = 1; // Example defaults
      utterance.onstart = handleActualAudioStart;
      utterance.onend = () => handleAudioProcessEnd(true);
      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        console.error("Browser Speech Synthesis error:", event.error, event);
        if (event.error !== 'interrupted') { // Don't toast for "interrupted" as it's often intentional
          toast({ title: "Browser TTS Error", description: `Error: ${event.error || 'Unknown speech synthesis error'}. Check console.`, variant: "destructive" });
        }
        handleAudioProcessEnd(false); // Indicate audio did not play successfully
      };
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn("Browser Speech Synthesis not supported.");
      toast({ title: "TTS Not Supported", description: "Browser does not support speech synthesis.", variant: "default" });
      handleAudioProcessEnd(false); // Indicate audio did not play successfully
    }
  }, [toast, handleActualAudioStart, handleAudioProcessEnd]);

  const speakText = useCallback(async (text: string) => {
    // Pre-processing for specific terms that TTS might mispronounce
    const processedText = text.replace(/EZCORP/gi, "E. Z. Corp"); // Example: "E Z Corp"
    handleAudioProcessStart(processedText); // Notify that audio processing for this text has begun

    // Add AI's message to the log as soon as we decide to speak it
    if (processedText.trim() !== "" && currentAiResponseTextRef.current) {
        // Ensure we don't add duplicates if speakText is somehow called multiple times for the same response
        if (!messages.find(m => m.text === currentAiResponseTextRef.current && m.sender === 'ai')) {
            addMessage(currentAiResponseTextRef.current, 'ai');
        }
    }

    // If in text-only mode, or text is empty, no need to play audio.
    if (communicationModeRef.current === 'text-only' || processedText.trim() === "") {
      setIsSendingMessage(false); // Ensure loading state is cleared
      setIsSpeaking(false); // Ensure speaking state is false
      return;
    }

    // Stop any currently playing ElevenLabs audio or browser TTS
    if (elevenLabsAudioRef.current && elevenLabsAudioRef.current.src && !elevenLabsAudioRef.current.ended && !elevenLabsAudioRef.current.paused) {
       elevenLabsAudioRef.current.pause();
       if (elevenLabsAudioRef.current.src.startsWith('blob:')) { // Check if it's a blob URL
           URL.revokeObjectURL(elevenLabsAudioRef.current.src);
       }
       elevenLabsAudioRef.current.src = ''; // Clear src
       elevenLabsAudioRef.current = null; // Release the reference before creating a new one
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
        model_id: 'eleven_multilingual_v2', // Or your preferred model
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true }
      });

      try {
        const response = await fetch(elevenLabsUrl, { method: "POST", headers, body });
        if (response.ok) {
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl); // Create new audio object
          elevenLabsAudioRef.current = audio; // Assign to ref
          audio.onplay = handleActualAudioStart; // TTS has started
          audio.onended = () => handleAudioProcessEnd(true); // TTS finished successfully
          audio.onerror = (e) => {
            console.error("Error playing ElevenLabs audio:", e);
            toast({ title: "ElevenLabs Playback Error", description: "Could not play audio. Falling back to browser TTS.", variant: "destructive" });
            browserSpeakInternal(processedText); // Fallback
          };
          await audio.play();
          return; // Exit if ElevenLabs is successful
        } else {
          // Handle ElevenLabs API errors more gracefully
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
    // Fallback to browser TTS if ElevenLabs is not configured or fails
    browserSpeakInternal(processedText);
  }, [
      elevenLabsApiKey,
      elevenLabsVoiceId,
      toast,
      handleActualAudioStart,
      handleAudioProcessEnd,
      addMessage,
      messages, // messages is needed for the duplicate check
      browserSpeakInternal,
      handleAudioProcessStart,
      setIsSendingMessage, // Include if it's used (it is)
      setIsSpeaking, // Include if it's used (it is)
    ]);

  useEffect(() => {
    speakTextRef.current = speakText;
  }, [speakText]);

  const handleSendMessage = useCallback(async (text: string, method: 'text' | 'voice') => {
    if (text.trim() === '') return;
    addMessage(text, 'user');
    setIsSendingMessage(true);
    setConsecutiveSilencePrompts(0); // Reset silence counter on user message
    isEndingSessionRef.current = false; // Ensure session ending flag is reset

    // Prepare chat history for Genkit, excluding empty messages
    const genkitChatHistory = messages
        .filter(msg => msg.text && msg.text.trim() !== "") // Filter out empty messages
        .map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }],
        }));

    try {
      const flowInput: GenerateChatResponseInput = {
        userMessage: text,
        knowledgeBaseContent: MOCK_KNOWLEDGE_BASE_CONTENT,
        personaTraits: personaTraits,
        chatHistory: genkitChatHistory, // Pass the filtered history
      };
      const result = await generateChatResponse(flowInput);
      await speakTextRef.current(result.aiResponse);
    } catch (error) {
      console.error("Failed to get AI response:", error);
      const errorMessage = "Sorry, I encountered an error. Please try again.";
      // Add error message to log and speak it
      // addMessage(errorMessage, 'ai'); // Already handled by speakText
      await speakTextRef.current(errorMessage);
    } // isSendingMessage will be set to false by speakText -> handleActualAudioStart or handleAudioProcessEnd
  }, [addMessage, messages, personaTraits, setIsSendingMessage]); // add personaTraits, isSendingMessage

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
    recognition.continuous = false; // We want it to stop after a pause
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
      setInputValue(finalTranscript || interimTranscript); // Update input value for display or text submission
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false); // Always set listening to false on error
      console.log("SpeechRecognition.onerror fired. Error:", event.error, "Mode:", communicationModeRef.current);

      if (event.error === 'no-speech' && communicationModeRef.current === 'audio-only') {
        if (!isSpeakingRef.current && !isEndingSessionRef.current) { // Only prompt if AI isn't already speaking or ending
          setConsecutiveSilencePrompts(currentPrompts => {
            const newPromptCount = currentPrompts + 1;
            // Check again inside the state setter to ensure the most current state
            if (!isSpeakingRef.current && !isEndingSessionRef.current) {
                if (newPromptCount >= MAX_SILENCE_PROMPTS) {
                    isEndingSessionRef.current = true; // Set flag before speaking
                    speakTextRef.current("It seems no one is here. Ending the session.");
                } else {
                    speakTextRef.current("Hello? Is someone there?");
                }
            }
            return newPromptCount;
          });
        } else {
            console.log("SpeechRecognition 'no-speech': Skipped 'Hello/Ending' prompt because AI is already speaking or session is ending.");
        }
      } else if (event.error !== 'no-speech' && event.error !== 'aborted' && event.error !== 'network' && event.error !== 'interrupted' && (event as any).name !== 'AbortError') {
        // Avoid toasting for common non-critical errors
        console.log(`Condition met for toast. Error: "${event.error}" is not 'no-speech', 'aborted', 'network', 'interrupted', or 'AbortError'.`);
        toast({ title: "Microphone Error", description: `Mic error: ${event.error}. Please check permissions.`, variant: "destructive" });
      } else {
        console.log(`Error "${event.error}" occurred, but no toast will be shown due to specific handling or benign nature.`);
      }
    };

    recognition.onend = () => {
      console.log("SpeechRecognition.onend fired.");
      // isListening should have been set to false by onstart of listening or by onerror
      // We get the final transcript that was set by onresult
      const finalTranscript = inputValueRef.current; // Use the ref for the most current value

      if (finalTranscript && finalTranscript.trim() && !isEndingSessionRef.current) { // Check if session is ending
        handleSendMessageRef.current(finalTranscript, 'voice');
      }
      setInputValue(''); // Clear input field after processing
      // setIsListening(false); // Redundant if set in onstart and onerror, but safe.
    };
    return recognition;
  }, [toast, setInputValue]); // Removed isListening from here to avoid re-creating recognition on its change

  // Effect to initialize and cleanup speech recognition instance
  useEffect(() => {
    const rec = initializeSpeechRecognition();
    recognitionRef.current = rec; // Store the instance in the ref

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort(); // Ensure it's stopped
        // Nullify handlers to prevent them from being called on a stale instance
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current = null; // Clear the ref
      }
    };
  }, [initializeSpeechRecognition]); // Only re-run if initializeSpeechRecognition changes

 // Effect to start/stop listening based on isListening state
 useEffect(() => {
    const recInstance = recognitionRef.current;
    if (!recInstance) return;

    if (isListening) {
      // Guard: Don't start listening if in text-only mode or if AI is speaking
      if (communicationModeRef.current === 'text-only' || isSpeakingRef.current) {
        if (isListening) setIsListening(false); // Ensure isListening is false if we can't start
        return;
      }

      setInputValue(''); // Clear previous input
      try {
        // Attempt to stop any previous recognition instance before starting a new one.
        // This can help reset the browser's speech recognition state.
        try {
          console.log("EFFECT: Attempting to stop recognition before starting (if active).");
          recInstance.stop();
        } catch (stopError: any) {
          // 'InvalidStateError' is common if recognition wasn't active, so we can ignore it.
          if (stopError.name !== 'InvalidStateError') {
            console.warn('EFFECT: Non-critical error stopping recognition before start:', stopError);
          } else {
            console.log("EFFECT: 'InvalidStateError' stopping recognition before start (normal if not active).")
          }
        }

        console.log("EFFECT: Attempting to start speech recognition.");
        recInstance.start();
        console.log("EFFECT: Speech recognition started successfully.");
      } catch (startError: any) {
        console.error('EFFECT: Error starting speech recognition:', startError);
        console.error('EFFECT: Error name:', startError.name);
        console.error('EFFECT: Error message:', startError.message);
        // Only toast for errors that aren't expected from rapid start/stop or permission issues.
        if (startError.name !== 'InvalidStateError' && startError.name !== 'NoMicPermissionError' && startError.name !== 'AbortError') {
          toast({
            variant: 'destructive',
            title: 'Microphone Start Error',
            description: `${startError.name}: ${startError.message || 'Could not start microphone. Check permissions.'}`,
          });
        } else {
          console.log(`EFFECT: Suppressed toast for mic start error: ${startError.name}`);
        }
        setIsListening(false); // Ensure isListening is false if start failed
      }
    } else { // If isListening is false
      if (recInstance) {
        try {
          // recInstance.abort(); // Use abort for a more forceful stop
          recInstance.stop(); // Or stop() if abort() is too aggressive or causes issues
        } catch (e: any) {
          // 'InvalidStateError' can occur if stop() is called when not listening, safe to ignore.
          if (e.name !== 'InvalidStateError') {
             console.warn("EFFECT: Error stopping speech recognition (but not InvalidStateError):", e);
          }
        }
      }
    }
  }, [isListening, toast, setInputValue]); // Dependencies


  const handleModeSelectionSubmit = () => {
    resetConversation(); // Reset state before changing mode
    setCommunicationMode(selectedInitialMode);
    setShowSplashScreen(false);
    // Initial greeting will be triggered by the useEffect watching showSplashScreen
  };

  const handleEndChatManually = () => {
    if (communicationMode === 'audio-only') {
      setShowLogForSaveConfirmation(true);
      setShowSaveDialog(true);
      // Stop listening if active
      if (isListening) {
        toggleListeningRef.current(false);
      }
      // Stop speaking if active
      if (isSpeakingRef.current && elevenLabsAudioRef.current) {
         elevenLabsAudioRef.current.pause();
         if (elevenLabsAudioRef.current.src.startsWith('blob:')) URL.revokeObjectURL(elevenLabsAudioRef.current.src);
         elevenLabsAudioRef.current.src = '';
      }
      if (typeof window !== 'undefined' && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);

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
    // Proceed to reset and go to splash screen regardless of save choice
    setShowLogForSaveConfirmation(false); // Hide the log again
    resetConversation();
    setShowSplashScreen(true);
  };


  const handleChangeCommunicationMode = () => {
    resetConversation(); // Reset state before changing mode
    setCommunicationMode(prevMode => {
      const newMode = prevMode === 'audio-text' ? 'text-only' : (prevMode === 'text-only' ? 'audio-only' : 'audio-text');
      // Re-initialize speech recognition if moving to a mode that needs it and it's not ready
      if ((newMode === 'audio-text' || newMode === 'audio-only') && !recognitionRef.current) {
        recognitionRef.current = initializeSpeechRecognition(); // Ensure it's re-initialized
      }
      return newMode;
    });
    // Initial greeting will be triggered by the useEffect watching showSplashScreen/communicationMode
  };

  const modeButtonText = () => {
    if (communicationMode === 'audio-text') return "Switch to Text-Only";
    if (communicationMode === 'text-only') return "Switch to Audio-Only";
    return "Switch to Audio & Text"; // Covers 'audio-only'
  };

  useEffect(() => {
    if (!showSplashScreen && !aiHasInitiatedConversation && personaTraits && messages.length === 0 && !isSpeakingRef.current && !isSendingMessage) {
      setIsSendingMessage(true);
      setAiHasInitiatedConversation(true); // Mark that we're initiating
      const initGreeting = async () => {
        try {
          const result = await generateInitialGreeting({ personaTraits });
          await speakTextRef.current(result.greetingMessage);
          // setIsSendingMessage(false) will be handled by speakText logic
        } catch (error) {
          console.error("Failed to get initial AI greeting:", error);
          const errMsg = "Hello! I had a little trouble starting up. Please try changing modes or refreshing.";
          // addMessage(errMsg, 'ai'); // Already handled by speakText
          await speakTextRef.current(errMsg);
          // setIsSendingMessage(false) will be handled by speakText logic
        }
      };
      initGreeting();
    }
  }, [showSplashScreen, aiHasInitiatedConversation, personaTraits, messages.length, isSendingMessage, setIsSendingMessage, setAiHasInitiatedConversation]); // Removed speakText from deps

  // Load initial settings from localStorage
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
    const storedSplashImage = localStorage.getItem(SPLASH_IMAGE_STORAGE_KEY);
    if (storedSplashImage) {
        setSplashImageSrc(storedSplashImage);
    } else {
        setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC); // Fallback to default if nothing in storage
    }
  }, []);

  // This useEffect handles component unmount cleanup
  // It's crucial that resetConversation is stable or this runs too often.
  // The resetConversation itself is memoized with useCallback.
  useEffect(() => {
    // Capture the current resetConversation function.
    const performResetOnUnmount = resetConversation;
    return () => {
      performResetOnUnmount();
    };
  }, [resetConversation]); // Only re-bind if resetConversation changes.


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
              height={267} // Assuming 3:2 aspect ratio for the placeholder
              className="rounded-lg shadow-md object-cover"
              priority // Load this image quickly
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


  const imageProps: React.ComponentProps<typeof Image> = {
    src: avatarSrc,
    alt: "AI Blair Avatar",
    width: communicationMode === 'audio-only' ? 200 : 120,
    height: communicationMode === 'audio-only' ? 200 : 120,
    className: cn(
      "rounded-full border-4 border-primary shadow-md object-cover transition-all duration-300",
      isSpeaking && "animate-pulse-speak"
    ),
    priority: true, // Make avatar high priority
  };
  // Add data-ai-hint only if it's the default placeholder or a non-data URI that might be a placeholder
   if (avatarSrc === DEFAULT_AVATAR_SRC || (avatarSrc && !avatarSrc.startsWith('data:image') && !avatarSrc.startsWith('https://placehold.co'))) {
     imageProps['data-ai-hint'] = "professional woman";
     // If avatarSrc is an old placeholder URL that's not the current default, reset to default.
     // This handles cases where localStorage might have an old non-data-uri placeholder.
     if (avatarSrc && !avatarSrc.startsWith('https://placehold.co') && !avatarSrc.startsWith('data:image')) {
        imageProps.src = DEFAULT_AVATAR_SRC; // Fallback to a known good placeholder
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
          {(messages.length > 0 && showLogForSaveConfirmation) && (
            <div className="w-full max-w-md mt-6">
                 <ConversationLog messages={messages} isLoadingAiResponse={false} avatarSrc={avatarSrc} />
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
          {aiHasInitiatedConversation && !showSaveDialog && ( // Hide End Chat if dialog is open
            <Button
              onClick={handleEndChatManually}
              variant="destructive"
              size="default" // Smaller button
              className="mt-8"
            >
              <Power className="mr-2 h-5 w-5" /> End Chat
            </Button>
          )}
           <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
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
    // For 'audio-text' and 'text-only'
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
            isSpeaking={isSpeaking} // Pass isSpeaking
            showMicButton={communicationModeRef.current === 'audio-text'} // Only show for audio-text
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

