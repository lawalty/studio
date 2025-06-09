'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { Save, AlertTriangle } from 'lucide-react';

// These would be securely stored or managed in a real app.
// For testing, if localStorage is empty, these will be used.
const FALLBACK_API_KEYS = {
  gemini: "TEST_GEMINI_API_KEY_12345",
  tts: "TEST_TTS_API_KEY_67890",
  stt: "TEST_STT_API_KEY_ABCDE",
  voiceId: "TEST_VOICE_ID_XYZ",
};

interface ApiKeys {
  gemini: string;
  tts: string;
  stt: string;
  voiceId: string;
}

const API_KEYS_STORAGE_KEY = "aiBlairApiKeys";

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({ gemini: '', tts: '', stt: '', voiceId: '' });
  const [usingFallback, setUsingFallback] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const storedKeys = localStorage.getItem(API_KEYS_STORAGE_KEY);
    if (storedKeys) {
      setApiKeys(JSON.parse(storedKeys));
      setUsingFallback(false);
    } else {
      // No stored keys, use fallback for testing
      setApiKeys(FALLBACK_API_KEYS);
      setUsingFallback(true);
       toast({
        title: "Using Fallback Keys",
        description: "No API keys found in local storage. Using test keys.",
        variant: "default",
        duration: 5000,
      });
    }
  }, [toast]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKeys({ ...apiKeys, [e.target.name]: e.target.value });
    if (usingFallback) setUsingFallback(false); // User is now editing, so not using pure fallback
  };

  const handleSave = () => {
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(apiKeys));
    setUsingFallback(false); // Keys are now explicitly saved
    toast({ title: "API Keys Saved", description: "Your API keys have been updated." });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">API Key Management</CardTitle>
        <CardDescription>
          Manage API keys for Gemini (AI Model), Text-to-Speech (TTS), Speech-to-Text (STT), and the TTS Voice ID.
          These keys are stored in your browser's local storage for this demo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {usingFallback && (
          <div className="p-3 rounded-md bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2" />
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                You are currently using fallback API keys for testing. Please enter your actual keys and save.
              </p>
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="geminiKey" className="font-medium">Gemini API Key</Label>
          <Input id="geminiKey" name="gemini" type="password" value={apiKeys.gemini} onChange={handleChange} placeholder="Enter Gemini API Key" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ttsKey" className="font-medium">TTS API Key (e.g., Elevenlabs)</Label>
          <Input id="ttsKey" name="tts" type="password" value={apiKeys.tts} onChange={handleChange} placeholder="Enter TTS API Key" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="voiceId" className="font-medium">TTS Voice ID</Label>
          <Input id="voiceId" name="voiceId" value={apiKeys.voiceId} onChange={handleChange} placeholder="Enter Voice ID for TTS" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sttKey" className="font-medium">STT API Key</Label>
          <Input id="sttKey" name="stt" type="password" value={apiKeys.stt} onChange={handleChange} placeholder="Enter STT API Key" />
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" /> Save API Keys
        </Button>
      </CardFooter>
    </Card>
  );
}
