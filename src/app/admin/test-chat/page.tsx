
'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { generateChatResponse, type GenerateChatResponseInput, type GenerateChatResponseOutput } from '@/ai/flows/generate-chat-response';
import { Loader2, SendHorizontal, Bot, User, Trash2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import AdminNav from '@/components/admin/AdminNav';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface TestMessage {
  role: 'user' | 'model';
  text: string;
}

export default function TestChatPage() {
  const [inputValue, setInputValue] = useState('');
  const [chatHistory, setChatHistory] = useState<TestMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim()) {
      toast({ title: "Input is empty", description: "Please enter a message to send.", variant: "destructive" });
      return;
    }
    
    setIsSending(true);

    const newHistory: TestMessage[] = [...chatHistory, { role: 'user', text: inputValue }];
    setChatHistory(newHistory);
    const currentUserInput = inputValue;
    setInputValue('');

    const historyForGenkit = newHistory.map(msg => ({
      role: msg.role,
      content: [{ text: msg.text }]
    }));

    try {
      // NOTE: For testing purposes, we send minimal persona info.
      // The flow has defaults if the persona info is missing from the config documents.
      const flowInput: GenerateChatResponseInput = {
        personaTraits: "A helpful AI assistant.",
        personalBio: "I am a testing AI.",
        conversationalTopics: "General",
        chatHistory: historyForGenkit,
        language: 'English',
        communicationMode: 'text-only',
      };
      
      const result: GenerateChatResponseOutput = await generateChatResponse(flowInput);

      setChatHistory(prev => [...prev, { role: 'model', text: result.aiResponse }]);

    } catch (error: any) {
      console.error("Error calling generateChatResponse:", error);
      toast({
        title: "Error",
        description: `An error occurred: ${error.message}`,
        variant: "destructive",
      });
      // Roll back the user message if the API call fails
      setChatHistory(prev => prev.slice(0, -1));
      setInputValue(currentUserInput);
    } finally {
      setIsSending(false);
    }
  }, [inputValue, chatHistory, toast]);

  const handleReset = () => {
    setChatHistory([]);
    setInputValue('');
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-8">
      <AdminNav />
      <Card>
        <CardHeader>
          <CardTitle>Test Conversational Context</CardTitle>
          <CardDescription>
            Use this page to test the AI&apos;s ability to remember context within a single conversation. 
            Each message sent includes the full history above it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <Label>Conversation History</Label>
                    <Button variant="ghost" size="sm" onClick={handleReset}>
                        <Trash2 className="mr-2 h-4 w-4" /> Reset
                    </Button>
                </div>
                <ScrollArea className="h-96 w-full rounded-md border p-4 space-y-4">
                    {chatHistory.length === 0 ? (
                        <p className="text-muted-foreground text-center">Conversation is empty. Send a message to begin.</p>
                    ) : (
                        chatHistory.map((msg, index) => (
                            <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                {msg.role === 'model' && <Bot className="h-6 w-6 text-primary flex-shrink-0" />}
                                <div className={`max-w-xl rounded-lg p-3 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                    <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                                </div>
                                {msg.role === 'user' && <User className="h-6 w-6 text-primary flex-shrink-0" />}
                            </div>
                        ))
                    )}
                </ScrollArea>
            </div>
            <Separator />
            <div className="space-y-2">
                <Label htmlFor="message-input">User Message</Label>
                <div className="flex gap-2">
                    <Input
                        id="message-input"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Type your message here to test the next turn..."
                        onKeyDown={(e) => { if (e.key === 'Enter' && !isSending) handleSendMessage(); }}
                        disabled={isSending}
                    />
                    <Button onClick={handleSendMessage} disabled={isSending}>
                        {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizontal className="mr-2 h-4 w-4" />}
                        Send
                    </Button>
                </div>
            </div>
        </CardContent>
        <CardFooter>
            <CardDescription>
                Example Scenario: 1) AI asks a question with options. 2) You reply with one option (e.g., &quot;Sales&quot;). 3) AI should understand the context and ask a relevant follow-up.
            </CardDescription>
        </CardFooter>
      </Card>
    </div>
  );
}
