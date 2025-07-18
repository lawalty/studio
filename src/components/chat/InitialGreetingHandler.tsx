
'use client';

import { useEffect, useState, useCallback } from 'react';
import { generateChatResponse } from '@/ai/flows/generate-chat-response';
import { useLanguage } from '@/context/LanguageContext';

interface InitialGreetingHandlerProps {
  config: {
    customGreeting: string;
    personaTraits: string;
    conversationalTopics: string;
    useTtsApi: boolean;
    elevenLabsApiKey: string | null;
    elevenLabsVoiceId: string | null;
  };
  addMessage: (text: string, sender: 'model') => void;
  setAiHasInitiatedConversation: (value: boolean) => void;
  setShowPreparingGreeting: (value: boolean) => void;
  communicationMode: 'audio-text' | 'text-only' | 'audio-only';
}

export default function InitialGreetingHandler({
  config,
  addMessage,
  setAiHasInitiatedConversation,
  setShowPreparingGreeting,
  communicationMode,
}: InitialGreetingHandlerProps) {
  const { language, translate } = useLanguage();
  const [hasRun, setHasRun] = useState(false);

  const speak = useCallback((textToSpeak: string) => {
    if (typeof window === 'undefined' || communicationMode === 'text-only' || !textToSpeak) {
        return;
    }
    
    const { useTtsApi, elevenLabsApiKey, elevenLabsVoiceId } = config;

    const playAudio = (src: string) => {
        const audio = new Audio(src);
        audio.play().catch(e => console.error("Audio playback failed", e));
    };
    
    const tryBrowserFallback = () => {
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(textToSpeak.replace(/EZCORP/gi, "easy corp"));
            window.speechSynthesis.speak(utterance);
        }
    };
    
    if (useTtsApi && elevenLabsApiKey && elevenLabsVoiceId) {
        fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`, {
            method: "POST",
            headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': elevenLabsApiKey },
            body: JSON.stringify({ text: textToSpeak.replace(/EZCORP/gi, "easy corp"), model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
        })
        .then(response => {
            if (!response.ok) throw new Error(`API Error ${response.status}`);
            return response.blob();
        })
        .then(audioBlob => {
            playAudio(URL.createObjectURL(audioBlob));
        })
        .catch(e => {
            console.error("ElevenLabs API Error:", e);
            tryBrowserFallback();
        });
    } else {
        tryBrowserFallback();
    }
  }, [communicationMode, config]);

  useEffect(() => {
    // This effect should only run once on component mount.
    if (hasRun) return;

    const initConversation = async () => {
      setHasRun(true);
      setShowPreparingGreeting(true);

      let greetingToUse = config.customGreeting?.trim() ? config.customGreeting.trim() : "";

      if (!greetingToUse) {
        try {
          const result = await generateChatResponse({
            personaTraits: config.personaTraits,
            conversationalTopics: config.conversationalTopics,
            language,
            chatHistory: [],
          });
          greetingToUse = result.aiResponse;
        } catch (error) {
          console.error("Error generating initial greeting:", error);
          greetingToUse = language === 'Spanish' ? "Hola! ¿Como puedo ayudarte hoy?" : "Hello! How can I help you today?";
        }
      }

      if (language !== 'English' && config.customGreeting) {
        greetingToUse = await translate(greetingToUse);
      }

      addMessage(greetingToUse, 'model');
      setShowPreparingGreeting(false);
      setAiHasInitiatedConversation(true);
      speak(greetingToUse);
    };

    initConversation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty to run only once.

  return null; // This component does not render anything.
}

    