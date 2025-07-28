
'use client';

import React, { type FormEvent, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mic, SendHorizontal, Square } from 'lucide-react';

interface MessageInputProps {
  onSendMessage: (text: string, method: 'text' | 'voice') => void;
  isSending: boolean;
  isSpeaking: boolean; 
  showMicButton?: boolean;
  isListening: boolean;
  onToggleListening: () => void;
  inputValue: string;
  onInputValueChange: (value: string) => void;
  disabled?: boolean; 
}

export default function MessageInput({
  onSendMessage,
  isSending,
  isSpeaking,
  showMicButton = true,
  isListening,
  onToggleListening,
  inputValue,
  onInputValueChange,
  disabled = false, 
}: MessageInputProps) {

  const handleSendText = useCallback(() => {
    if (inputValue.trim() === '' || isSending || disabled) return;
    onSendMessage(inputValue, 'text');
    onInputValueChange('');
  }, [inputValue, onSendMessage, isSending, onInputValueChange, disabled]);

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (disabled) return; 
    if (isListening) {
      onToggleListening(); 
    } else {
      handleSendText();
    }
  };

  const micButtonDisabled = disabled || isSending;
  const inputDisabled = disabled || isSending || isListening;
  const sendButtonDisabled = disabled || isSending || (isListening ? false : inputValue.trim() === '');

  const placeholderText = disabled 
    ? "Conversation ended. Please choose an option above." 
    : isListening 
      ? "Listening... Speak now or press send to finish." 
      : showMicButton 
        ? "Use the microphone or type your message..." 
        : "Type your message...";

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2">
      {showMicButton && (
        <Button
          type="button"
          size="icon"
          onClick={onToggleListening}
          disabled={micButtonDisabled}
          className={isListening ? "bg-accent text-accent-foreground ring-2 ring-accent" : ""}
          aria-label={isListening ? "Stop recording" : "Start recording"}
        >
          {isListening ? <Square size={20} /> : <Mic size={20} />}
        </Button>
      )}
      <Input
        type="text"
        placeholder={placeholderText}
        value={inputValue}
        onChange={(e) => onInputValueChange(e.target.value)}
        disabled={inputDisabled} 
      />
      <Button 
        type="submit" 
        size="icon" 
        disabled={sendButtonDisabled}
        aria-label="Send message"
      >
        <SendHorizontal size={20} />
      </Button>
    </form>
  );
}
