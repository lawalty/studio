
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from "@/hooks/use-toast";
import { Save, AlertTriangle, Speech } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface ApiKeys {
  gemini: string;
  tts: string;
  stt: string;
  voiceId: string;
  useTtsApi: boolean;
}

const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({ gemini: '', tts: '', stt: '', voiceId: '', useTtsApi: true });
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchKeys = async () => {
      setIsLoading(true);
      try {
        const docRef = doc(db, FIRESTORE_KEYS_PATH);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setApiKeys({
            gemini: data.gemini || '',
            tts: data.tts || '',
            stt: data.stt || '',
            voiceId: data.voiceId || '',
            useTtsApi: typeof data.useTtsApi === 'boolean' ? data.useTtsApi : true, // Default to true if not set
          });
        } else {
          setApiKeys({ gemini: '', tts: '', stt: '', voiceId: '', useTtsApi: true });
           toast({
            title: "API Keys Not Configured",
            description: "Please enter and save your API keys. They will be stored in Firestore.",
            variant: "default",
          });
        }
      } catch (error) {
        console.error("Error fetching API keys from Firestore:", error);
        toast({
          title: "Error Loading Keys",
          description: "Could not fetch API keys from the database. Please try again.",
          variant: "destructive",
        });
        setApiKeys({ gemini: '', tts: '', stt: '', voiceId: '', useTtsApi: true });
      }
      setIsLoading(false);
    };
    fetchKeys();
  }, [toast]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKeys({ ...apiKeys, [e.target.name]: e.target.value });
  };

  const handleSwitchChange = (checked: boolean) => {
    setApiKeys({ ...apiKeys, useTtsApi: checked });
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const docRef = doc(db, FIRESTORE_KEYS_PATH);
      await setDoc(docRef, apiKeys); // Save the entire apiKeys object including useTtsApi
      toast({ title: "API Keys Saved", description: "Your API keys and TTS preference have been saved to the database." });
    } catch (error) {
      console.error("Error saving API keys to Firestore:", error);
      toast({
        title: "Error Saving Keys",
        description: "Could not save API keys to the database. Please try again.",
        variant: "destructive",
      });
    }
    setIsLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">API Key Management</CardTitle>
        <CardDescription>
          Manage API keys for Gemini (AI Model), Text-to-Speech (TTS), Speech-to-Text (STT), and the TTS Voice ID.
          You can also toggle whether to use the configured Custom TTS API or fall back to the browser's default voice.
          <span className="block mt-2 font-semibold text-destructive/80 flex items-start">
            <AlertTriangle className="h-4 w-4 mr-1 mt-0.5 shrink-0" />
            <span>Security Warning: Storing API keys in a client-accessible database is not recommended for production. For optimal security, manage sensitive keys server-side using environment variables or a dedicated secrets manager.</span>
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p>Loading API keys...</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="geminiKey" className="font-medium">Gemini API Key</Label>
              <Input id="geminiKey" name="gemini" type="password" value={apiKeys.gemini} onChange={handleChange} placeholder="Enter Gemini API Key" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ttsKey" className="font-medium">Custom TTS API Key (e.g., Elevenlabs)</Label>
              <Input id="ttsKey" name="tts" type="password" value={apiKeys.tts} onChange={handleChange} placeholder="Enter TTS API Key" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voiceId" className="font-medium">Custom TTS Voice ID</Label>
              <Input id="voiceId" name="voiceId" value={apiKeys.voiceId} onChange={handleChange} placeholder="Enter Voice ID for TTS" />
            </div>
             <div className="flex items-center space-x-3 rounded-md border p-3 shadow-sm">
                <Speech className="h-5 w-5 text-primary" />
                <div className="flex-1 space-y-1">
                    <Label htmlFor="useTtsApi" className="font-medium">
                        Use Custom TTS API
                    </Label>
                    <p className="text-xs text-muted-foreground">
                        If ON, attempts to use the API Key and Voice ID above. If OFF, uses browser default voice.
                    </p>
                </div>
                <Switch
                    id="useTtsApi"
                    checked={apiKeys.useTtsApi}
                    onCheckedChange={handleSwitchChange}
                    aria-label="Toggle Custom TTS API usage"
                />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sttKey" className="font-medium">STT API Key</Label>
              <Input id="sttKey" name="stt" type="password" value={apiKeys.stt} onChange={handleChange} placeholder="Enter STT API Key" />
            </div>
          </>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={isLoading}>
          <Save className="mr-2 h-4 w-4" /> {isLoading ? 'Saving...' : 'Save API Keys & Settings'}
        </Button>
      </CardFooter>
    </Card>
  );
}
