'use client';

import React, { useState, useRef, useEffect, type FormEvent } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mic, SendHorizontal, Square } from 'lucide-react';

interface MessageInputProps {
  onSendMessage: (text: string, method: 'text' | 'voice') => void;
  isSending: boolean;
}

export default function MessageInput({ onSendMessage, isSending }: MessageInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const voiceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (inputValue.trim() === '' || isSending) return;
    
    if (isListening) { // If currently "listening", treat submit as voice input completion
      handleMicClick(); // This will clear timeout and send
    } else {
      onSendMessage(inputValue, 'text');
      setInputValue('');
    }
  };

  const handleMicClick = () => {
    if (isListening) {
      // Stop listening
      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
        voiceTimeoutRef.current = null;
      }
      setIsListening(false);
      if (inputValue.trim() !== '') {
        onSendMessage(inputValue, 'voice');
        setInputValue('');
      }
    } else {
      // Start listening
      setIsListening(true);
      // Simulate STT: auto-submit after 1.5s pause if there's input
      // In a real app, this would be driven by voice activity detection
      if (inputValue.trim() !== '') { // Only set timeout if there's already input
         voiceTimeoutRef.current = setTimeout(() => {
          if (inputValue.trim() !== '') {
            onSendMessage(inputValue, 'voice');
            setInputValue('');
          }
          setIsListening(false);
        }, 2500); // Extended for practical typing simulation
      }
    }
  };
  
  useEffect(() => {
    if (isListening && inputValue.trim() !== '') {
      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
      }
      voiceTimeoutRef.current = setTimeout(() => {
         if (inputValue.trim() !== '') {
            onSendMessage(inputValue, 'voice');
            setInputValue('');
          }
        setIsListening(false);
      }, 2500); // Auto-submit after 2.5s of inactivity while "listening" and there's text
    }
    return () => {
      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
      }
    };
  }, [inputValue, isListening, onSendMessage]);


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
        placeholder={isListening ? "Listening... (type or speak)" : "Type your message..."}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        disabled={isSending}
        className="flex-grow"
      />
      <Button type="submit" size="icon" disabled={isSending || inputValue.trim() === ''} aria-label="Send message">
        <SendHorizontal size={20} />
      </Button>
    </form>
  );
}
