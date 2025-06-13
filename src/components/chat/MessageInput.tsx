
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
  disabled?: boolean; // Added disabled prop
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
  disabled = false, // Default to false
}: MessageInputProps) {

  const handleSendText = useCallback(() => {
    if (inputValue.trim() === '' || isSending || isSpeaking || disabled) return;
    onSendMessage(inputValue, 'text');
    onInputValueChange('');
  }, [inputValue, onSendMessage, isSending, isSpeaking, onInputValueChange, disabled]);

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (disabled) return; // Prevent submission if component is generally disabled
    if (isListening) {
      onToggleListening(); 
    } else {
      handleSendText();
    }
  };

  const micButtonDisabled = disabled || (isListening 
    ? false 
    : (isSending || isSpeaking)); 

  const inputDisabled = disabled || isSending || (isSpeaking && !isListening) || (isListening && communicationMode === 'audio-only');
  const sendButtonDisabled = disabled || (isListening ? false : ((isSending || isSpeaking) || inputValue.trim() === ''));

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2">
      {showMicButton && (
        <Button
          type="button"
          variant="outline"
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
        placeholder={isListening ? "Listening... Speak now or press send to finish." : (disabled ? "Session ended." : "Type your message...")}
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

