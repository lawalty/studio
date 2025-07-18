
'use client';

import { useEffect, useState } from 'react';
import { generateChatResponse } from '@/ai/flows/generate-chat-response';
import { useLanguage } from '@/context/LanguageContext';

interface InitialGreetingHandlerProps {
  config: {
    customGreeting: string;
    personaTraits: string;
    conversationalTopics: string;
  };
  addMessage: (text: string, sender: 'model') => void;
  speakText: (text: string) => void;
  setAiHasInitiatedConversation: (value: boolean) => void;
  setShowPreparingGreeting: (value: boolean) => void;
  communicationMode: 'audio-text' | 'text-only' | 'audio-only';
}

export default function InitialGreetingHandler({
  config,
  addMessage,
  speakText,
  setAiHasInitiatedConversation,
  setShowPreparingGreeting,
  communicationMode,
}: InitialGreetingHandlerProps) {
  const { language, translate } = useLanguage();
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    // This effect should only run once on component mount.
    if (hasRun) return;

    const initConversation = async () => {
      setHasRun(true);
      setAiHasInitiatedConversation(true);
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

      if (communicationMode !== 'text-only') {
        speakText(greetingToUse);
      }
    };

    initConversation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRun, language]); // Intentionally limited dependencies to prevent re-running.

  return null; // This component does not render anything.
}
