
'use client';

import React, { useState, useRef, useEffect, type FormEvent, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mic, SendHorizontal, Square } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

interface MessageInputProps {
  onSendMessage: (text: string, method: 'text' | 'voice') => void;
  isSending: boolean;
}

export default function MessageInput({ onSendMessage, isSending }: MessageInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();

  const handleSend = useCallback((text: string, method: 'text' | 'voice') => {
    if (text.trim() === '' || isSending) return;
    onSendMessage(text, method);
    setInputValue('');
  }, [onSendMessage, isSending]);

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false; 
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setInputValue(finalTranscript || interimTranscript);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      toast({
        title: "Microphone Error",
        description: `Speech recognition error: ${event.error}. Please ensure microphone access is allowed.`,
        variant: "destructive",
      });
      setIsListening(false);
    };
    
    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null; // Clean up onend as well
        recognitionRef.current.stop();
      }
    };
  }, [toast]);


  // Effect for handling recognition.onend
  useEffect(() => {
    const currentRecognition = recognitionRef.current;
    if (currentRecognition) {
      const onEndHandler = () => {
        setIsListening(false); // Update local listening state

        // `inputValue` here is from the closure of this effect.
        // It will be the value of `inputValue` from the render when this effect last ran.
        const transcript = inputValue; 

        if (transcript && transcript.trim()) {
          handleSend(transcript, 'voice'); // Call prop that updates parent
          setInputValue('');             // Update local state to clear input
        }
      };
      currentRecognition.onend = onEndHandler;

      // Cleanup function for this specific effect
      return () => {
        if (currentRecognition) {
          currentRecognition.onend = null;
        }
      };
    }
  // Dependencies:
  // - handleSend: If this changes (e.g. parent's onSendMessage or isSending prop changes), 
  //   we need to re-attach onEndHandler with the new handleSend.
  // - inputValue: If inputValue changes (e.g., user types or STT updates it), the onEndHandler, 
  //   which captures inputValue from its closure, needs to be redefined to get the latest value.
  // setIsListening and setInputValue are stable and don't need to be listed.
  }, [handleSend, inputValue]);


  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop(); 
    } else {
      handleSend(inputValue, 'text');
    }
  };

  const handleMicClick = () => {
    if (!recognitionRef.current) {
       toast({
        title: "Unsupported Feature",
        description: "Speech recognition is not supported or enabled in your browser.",
        variant: "destructive",
      });
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      // setIsListening(false); // onend handler will set this
    } else {
      setInputValue(''); 
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
         console.error("Error starting speech recognition:", e);
         toast({
            title: "Microphone Error",
            description: "Could not start speech recognition. Make sure microphone access is allowed.",
            variant: "destructive",
          });
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleMicClick}
        disabled={isSending} 
        className={isListening ? "bg-accent text-accent-foreground ring-2 ring-accent" : ""}
        aria-label={isListening ? "Stop recording" : "Start recording"}
      >
        {isListening ? <Square size={20} /> : <Mic size={20} />}
      </Button>
      <Input
        type="text"
        placeholder={isListening ? "Listening... Speak now." : "Type your message or click mic to speak..."}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        disabled={isSending || (isListening && recognitionRef.current?.interimResults === false)}
        className="flex-grow"
      />
      <Button type="submit" size="icon" disabled={isSending || inputValue.trim() === ''} aria-label="Send message">
        <SendHorizontal size={20} />
      </Button>
    </form>
  );
}
