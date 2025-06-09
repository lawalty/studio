
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
      // STT not supported
      // console.warn("Speech Recognition API not supported in this browser.");
      // Mic button could be disabled here, or show a toast.
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false; // True means it keeps listening after pauses. False means it stops after first pause.
    recognition.interimResults = true; // Show interim results as user speaks
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

    recognition.onend = () => {
      setIsListening(false);
      // Auto-send logic was here, but let's make it explicit on final result for `continuous=false`
      // Or rely on user clicking Send or Enter if they want to edit.
      // For "automatically processing voice input upon a short pause", this is where it would happen.
      // If inputValue has content from STT, send it.
      // We need to access the latest inputValue here, possibly via a ref or by passing it.
      // For now, let's assume the final transcript is in inputValue.
      // The onresult event already updates inputValue.
      // The challenge: onend fires, inputValue might not be the *very latest* if setInputValue is async.
      // This is why `finalTranscript` was captured above.
      // Let's refine: if STT ends and there's a final transcript, send it.
    };
    
    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [toast]);


  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop(); // Stop STT, onend will handle sending if needed or user can click send.
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
      setIsListening(false); 
      // If inputValue has content, it will be sent by onSendMessage in recognition.onend,
      // or user can click Send button / press Enter.
      // We call stop(), onend will be triggered.
      // To ensure immediate send if there was content:
      // if (inputValue.trim()) {
      //  handleSend(inputValue, 'voice');
      // }
    } else {
      setInputValue(''); // Clear previous input before starting new STT
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
  
  // Refined onend for auto-send behavior
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = () => {
        setIsListening(false);
        // Access inputValue directly here as it should be updated by onresult
        setInputValue(currentVal => {
          if (currentVal.trim()) {
            handleSend(currentVal, 'voice');
            return ''; // Clear after sending
          }
          return currentVal; // Or don't clear if nothing sent
        });
      };
    }
  }, [handleSend]); // Add handleSend to dependencies of this useEffect


  return (
    <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleMicClick}
        disabled={isSending} // Potentially disable if STT not supported
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
        disabled={isSending || (isListening && recognitionRef.current?.interimResults === false)} // Disable typing during non-interim STT
        className="flex-grow"
      />
      <Button type="submit" size="icon" disabled={isSending || inputValue.trim() === ''} aria-label="Send message">
        <SendHorizontal size={20} />
      </Button>
    </form>
  );
}
