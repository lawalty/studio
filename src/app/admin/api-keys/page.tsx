
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from "@/hooks/use-toast";
import { Save, AlertTriangle, Speech, MessageSquare, BrainCircuit } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Separator } from '@/components/ui/separator';

interface ApiKeys {
  geminiGenerative: string;
  geminiEmbedding: string;
  tts: string;
  voiceId: string;
  useTtsApi: boolean;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
}

const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({
    geminiGenerative: '',
    geminiEmbedding: '',
    tts: '',
    voiceId: '',
    useTtsApi: true,
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioPhoneNumber: '',
  });
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
            geminiGenerative: data.geminiGenerative || data.gemini || '',
            geminiEmbedding: data.geminiEmbedding || '',
            tts: data.tts || '',
            voiceId: data.voiceId || '',
            useTtsApi: typeof data.useTtsApi === 'boolean' ? data.useTtsApi : true,
            twilioAccountSid: data.twilioAccountSid || '',
            twilioAuthToken: data.twilioAuthToken || '',
            twilioPhoneNumber: data.twilioPhoneNumber || '',
          });
        } else {
          setApiKeys({
            geminiGenerative: '', geminiEmbedding: '', tts: '', voiceId: '', useTtsApi: true,
            twilioAccountSid: '', twilioAuthToken: '', twilioPhoneNumber: '',
          });
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
        setApiKeys({
            geminiGenerative: '', geminiEmbedding: '', tts: '', voiceId: '', useTtsApi: true,
            twilioAccountSid: '', twilioAuthToken: '', twilioPhoneNumber: '',
        });
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
      // Construct the object to save, excluding the old 'gemini' key
      const { geminiGenerative, geminiEmbedding, ...restOfKeys } = apiKeys;
      const dataToSave = {
        geminiGenerative,
        geminiEmbedding,
        ...restOfKeys,
      };

      await setDoc(docRef, dataToSave);
      toast({ title: "API Keys Saved", description: "Your API keys and settings have been saved to the database." });
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
          Manage API keys for Gemini, TTS, and Twilio SMS services.
          <span className="block mt-2 font-semibold text-destructive/80 flex items-start">
            <AlertTriangle className="h-4 w-4 mr-1 mt-0.5 shrink-0" />
            <span>Storing API keys in Firestore is convenient for development but not recommended for production.</span>
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p>Loading API keys...</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
                <BrainCircuit className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Gemini AI Keys</h3>
            </div>
            <div className="space-y-2">
              <Label htmlFor="geminiGenerative" className="font-medium">Gemini Generative API Key</Label>
              <Input id="geminiGenerative" name="geminiGenerative" type="password" value={apiKeys.geminiGenerative} onChange={handleChange} placeholder="Enter key for chat, summarization, etc." />
              <p className="text-xs text-muted-foreground">Used for all conversational AI tasks. Ensure the <a href="https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com" target="_blank" rel="noopener noreferrer" className="underline text-primary">Generative Language API</a> is enabled in your Google Cloud project.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="geminiEmbedding" className="font-medium">Gemini Embedding API Key</Label>
              <Input id="geminiEmbedding" name="geminiEmbedding" type="password" value={apiKeys.geminiEmbedding} onChange={handleChange} placeholder="Enter key for knowledge base indexing" />
              <p className="text-xs text-muted-foreground">Used for indexing documents. If blank, the Generative key is used. Ensure the <a href="https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com" target="_blank" rel="noopener noreferrer" className="underline text-primary">Generative Language API</a> is enabled in your Google Cloud project.</p>
            </div>

            <Separator className="my-6" />

            <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Twilio SMS Configuration</h3>
            </div>
            <div className="space-y-2">
                <Label htmlFor="twilioAccountSid" className="font-medium">Twilio Account SID</Label>
                <Input id="twilioAccountSid" name="twilioAccountSid" value={apiKeys.twilioAccountSid} onChange={handleChange} placeholder="Enter Twilio Account SID" />
            </div>
            <div className="space-y-2">
                <Label htmlFor="twilioAuthToken" className="font-medium">Twilio Auth Token</Label>
                <Input id="twilioAuthToken" name="twilioAuthToken" type="password" value={apiKeys.twilioAuthToken} onChange={handleChange} placeholder="Enter Twilio Auth Token" />
            </div>
            <div className="space-y-2">
                <Label htmlFor="twilioPhoneNumber" className="font-medium">Twilio Phone Number</Label>
                <Input id="twilioPhoneNumber" name="twilioPhoneNumber" value={apiKeys.twilioPhoneNumber} onChange={handleChange} placeholder="Enter your Twilio phone number (e.g., +15551234567)" />
            </div>

            <Separator className="my-6" />
            
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
