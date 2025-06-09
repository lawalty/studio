
'use client';

import React, { type FormEvent, useCallback } from 'react'; // Removed useState, useRef, useEffect
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mic, SendHorizontal, Square } from 'lucide-react';
// Removed useToast as mic errors are handled by parent

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

  const handleSendText = useCallback(() => {
    if (inputValue.trim() === '' || isSending) return;
    onSendMessage(inputValue, 'text');
    onInputValueChange('');
  }, [inputValue, onSendMessage, isSending, onInputValueChange]);

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (isListening) {
      // If listening, pressing send or enter should stop listening.
      // The onend handler in page.tsx will then send the transcript.
      onToggleListening(); 
    } else {
      handleSendText();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2">
      {showMicButton && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onToggleListening} // Directly call parent's toggle
          disabled={isSending && !isListening} // Disable if sending text, but allow stopping listening
          className={isListening ? "bg-accent text-accent-foreground ring-2 ring-accent" : ""}
          aria-label={isListening ? "Stop recording" : "Start recording"}
        >
          {isListening ? <Square size={20} /> : <Mic size={20} />}
        </Button>
      )}
      <Input
        type="text"
        placeholder={isListening ? "Listening... Speak now or press send to finish." : "Type your message..."}
        value={inputValue}
        onChange={(e) => onInputValueChange(e.target.value)}
        disabled={isSending && !isListening} // Allow typing even if AI is "sending" audio
                                           // but disable if actively sending a text message
      />
      <Button 
        type="submit" 
        size="icon" 
        disabled={(isSending && !isListening) || (!isListening && inputValue.trim() === '')}
        aria-label="Send message"
      >
        <SendHorizontal size={20} />
      </Button>
    </form>
  );
}
