
'use client';

import React, { useState, useRef, useEffect, type FormEvent, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mic, SendHorizontal, Square } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

interface MessageInputProps {
  onSendMessage: (text: string, method: 'text' | 'voice') => void;
  isSending: boolean;
  showMicButton?: boolean;
  isListening: boolean;
  onToggleListening: () => void;
  inputValue: string;
  onInputValueChange: (value: string) => void;
}

export default function MessageInput({
  onSendMessage,
  isSending,
  showMicButton = true,
  isListening,
  onToggleListening,
  inputValue,
  onInputValueChange,
}: MessageInputProps) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();

  const handleSend = useCallback((text: string, method: 'text' | 'voice') => {
    if (text.trim() === '' || isSending) return;
    onSendMessage(text, method);
    onInputValueChange('');
  }, [onSendMessage, isSending, onInputValueChange]);

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      if (showMicButton) { // Only toast if mic button was intended to be shown
        // console.warn("Speech recognition not supported or enabled in your browser.");
        // No toast here as page.tsx will handle a global one if mic is attempted.
      }
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
      onInputValueChange(finalTranscript || interimTranscript); // Update parent's state
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      toast({
        title: "Microphone Error",
        description: `Speech recognition error: ${event.error}. Please ensure microphone access is allowed.`,
        variant: "destructive",
      });
      if (isListening) { // If it was listening, call onToggleListening to update parent state
        onToggleListening();
      }
    };

    recognition.onend = () => {
      // Parent (page.tsx) now controls isListening state changes and sending messages
      // This onend is mostly for cleanup or if parent needs to know recognition stopped naturally.
      // The parent's onToggleListening should handle sending the message if inputValue is present.
       if (isListening) { // If it was listening, call onToggleListening to update parent state
        onToggleListening(); // This will trigger logic in page.tsx to send if needed
      }
    };
    
    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
    };
  // onToggleListening and onInputValueChange are stable if defined with useCallback in parent
  // isListening is a prop, if it changes, this effect might re-run, which is generally fine.
  }, [toast, showMicButton, onInputValueChange, onToggleListening, isListening]);

  // Effect to start/stop recognition based on parent's isListening prop
  useEffect(() => {
    if (!recognitionRef.current) return;

    if (isListening) {
      onInputValueChange(''); // Clear input when starting to listen via button
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error("Error starting speech recognition:", e);
        toast({
            title: "Microphone Error",
            description: "Could not start speech recognition. Make sure microphone access is allowed.",
            variant: "destructive",
        });
        onToggleListening(); // Turn listening off in parent if start failed
      }
    } else {
      recognitionRef.current.stop();
    }
  }, [isListening, onToggleListening, toast, onInputValueChange]);


  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (isListening && recognitionRef.current) {
      // onToggleListening(); // This will stop listening and trigger send in parent
      recognitionRef.current.stop(); // Stop listening, onend will trigger onToggleListening
    } else {
      handleSend(inputValue, 'text');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2">
      {showMicButton && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onToggleListening}
          disabled={isSending}
          className={isListening ? "bg-accent text-accent-foreground ring-2 ring-accent" : ""}
          aria-label={isListening ? "Stop recording" : "Start recording"}
        >
          {isListening ? <Square size={20} /> : <Mic size={20} />}
        </Button>
      )}
      <Input
        type="text"
        placeholder={isListening ? "Listening... Speak now." : "Type your message..."}
        value={inputValue}
        onChange={(e) => onInputValueChange(e.target.value)}
        disabled={isSending || (isListening && !recognitionRef.current?.interimResults)} // was recognitionRef.current?.interimResults === false
        className="flex-grow"
      />
      <Button type="submit" size="icon" disabled={isSending || inputValue.trim() === ''} aria-label="Send message">
        <SendHorizontal size={20} />
      </Button>
    </form>
  );
}
