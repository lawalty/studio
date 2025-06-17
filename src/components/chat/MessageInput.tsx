
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
    if (inputValue.trim() === '' || isSending || isSpeaking || disabled) return;
    onSendMessage(inputValue, 'text');
    onInputValueChange('');
  }, [inputValue, onSendMessage, isSending, isSpeaking, onInputValueChange, disabled]);

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (disabled) return; 
    if (isListening) {
      onToggleListening(); 
    } else {
      handleSendText();
    }
  };

  // Disable mic button if component is disabled, or if (not listening AND (sending or speaking))
  const micButtonDisabled = disabled || (isListening ? false : (isSending || isSpeaking));
  
  // Disable input field if component is disabled, or if sending, or if (speaking and not listening), or if (listening and in audio-only mode implicitly)
  const inputDisabled = disabled || isSending || (isSpeaking && !isListening) || (isListening && !showMicButton); // Assuming !showMicButton implies audio-only for input context
  
  // Disable send button if component is disabled, or if (listening and mic isn't shown - implies form submit is for stopping listening), or if (not listening AND (sending OR speaking OR input is empty))
  const sendButtonDisabled = disabled || (isListening && showMicButton ? false : ((isSending || isSpeaking) || inputValue.trim() === ''));

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
