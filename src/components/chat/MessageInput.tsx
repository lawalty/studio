
'use client';

import React, { type FormEvent, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mic, SendHorizontal, Square } from 'lucide-react';

interface MessageInputProps {
  onSendMessage: (text: string, method: 'text' | 'voice') => void;
  isSending: boolean;
  isSpeaking: boolean; // Added isSpeaking
  showMicButton?: boolean;
  isListening: boolean;
  onToggleListening: () => void;
  inputValue: string;
  onInputValueChange: (value: string) => void;
}

export default function MessageInput({
  onSendMessage,
  isSending,
  isSpeaking, // Added isSpeaking
  showMicButton = true,
  isListening,
  onToggleListening,
  inputValue,
  onInputValueChange,
}: MessageInputProps) {

  const handleSendText = useCallback(() => {
    if (inputValue.trim() === '' || isSending || isSpeaking) return; // Don't send text if AI is speaking
    onSendMessage(inputValue, 'text');
    onInputValueChange('');
  }, [inputValue, onSendMessage, isSending, isSpeaking, onInputValueChange]);

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (isListening) {
      onToggleListening(); 
    } else {
      handleSendText();
    }
  };

  const micButtonDisabled = isListening 
    ? false // If listening, button is to stop, so always enabled
    : (isSending || isSpeaking); // If not listening, disable if sending text OR if AI is speaking

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
        placeholder={isListening ? "Listening... Speak now or press send to finish." : "Type your message..."}
        value={inputValue}
        onChange={(e) => onInputValueChange(e.target.value)}
        disabled={isSending || (isSpeaking && !isListening)} // Disable input if sending or if AI is speaking (unless user is already speaking)
      />
      <Button 
        type="submit" 
        size="icon" 
        disabled={isListening ? false : ((isSending || isSpeaking) || inputValue.trim() === '')} // Allow send to stop listening
        aria-label="Send message"
      >
        <SendHorizontal size={20} />
      </Button>
    </form>
  );
}

