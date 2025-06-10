
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { Save, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface ApiKeys {
  gemini: string;
  tts: string;
  stt: string;
  voiceId: string;
}

const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({ gemini: '', tts: '', stt: '', voiceId: '' });
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchKeys = async () => {
      setIsLoading(true);
      try {
        const docRef = doc(db, FIRESTORE_KEYS_PATH);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setApiKeys(docSnap.data() as ApiKeys);
        } else {
          setApiKeys({ gemini: '', tts: '', stt: '', voiceId: '' });
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
        setApiKeys({ gemini: '', tts: '', stt: '', voiceId: '' });
      }
      setIsLoading(false);
    };
    fetchKeys();
  }, [toast]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKeys({ ...apiKeys, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const docRef = doc(db, FIRESTORE_KEYS_PATH);
      await setDoc(docRef, apiKeys);
      toast({ title: "API Keys Saved", description: "Your API keys have been saved to the database." });
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
          These keys are stored in Firestore.
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
          </>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={isLoading}>
          <Save className="mr-2 h-4 w-4" /> {isLoading ? 'Saving...' : 'Save API Keys'}
        </Button>
      </CardFooter>
    </Card>
  );
}

