'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from "@/hooks/use-toast";
import { Save, Speech, MessageSquare, KeyRound, Terminal } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Separator } from '@/components/ui/separator';

interface ApiKeys {
  googleAiApiKey: string;
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
    googleAiApiKey: '',
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
            googleAiApiKey: data.googleAiApiKey || '',
            tts: data.tts || '',
            voiceId: data.voiceId || '',
            useTtsApi: typeof data.useTtsApi === 'boolean' ? data.useTtsApi : true,
            twilioAccountSid: data.twilioAccountSid || '',
            twilioAuthToken: data.twilioAuthToken || '',
            twilioPhoneNumber: data.twilioPhoneNumber || '',
          });
        }
      } catch (error) {
        console.error("Error fetching API keys from Firestore:", error);
        toast({
          title: "Error Loading Keys",
          description: "Could not fetch API keys from the database. Please try again.",
          variant: "destructive",
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
      await setDoc(docRef, apiKeys, { merge: true }); 
      toast({ title: "Settings Saved", description: "Your service settings have been saved to Firestore." });
    } catch (error) {
      console.error("Error saving API keys to Firestore:", error);
      toast({
        title: "Error Saving Keys",
        description: "Could not save keys to the database. Please try again.",
        variant: "destructive",
      });
    }
    setIsLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">API Key & Services Management</CardTitle>
        <CardDescription>
          Manage keys for all AI services and third-party integrations like Twilio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p>Loading settings...</p>
        ) : (
          <>
            <Alert variant="default" className="bg-sky-50 border-sky-200">
              <Terminal className="h-4 w-4 text-sky-700" />
              <AlertTitle className="text-sky-800 font-bold">Important: Central API Key Management</AlertTitle>
              <AlertDescription className="text-sky-700 space-y-3">
                  <p className="font-semibold">
                    This is the central place to manage your Google AI API Key. It is stored in Firestore and used by the server for all AI features.
                  </p>
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="googleAiApiKey" className="font-medium text-sky-800">Google AI API Key</Label>
                    <Input id="googleAiApiKey" name="googleAiApiKey" type="password" value={apiKeys.googleAiApiKey} onChange={handleChange} placeholder="Enter your Google AI API Key" />
                  </div>
              </AlertDescription>
            </Alert>

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
            
            <div className="flex items-center gap-2 mb-2">
                <Speech className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Custom Text-to-Speech (TTS)</h3>
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
          <Save className="mr-2 h-4 w-4" /> {isLoading ? 'Saving...' : 'Save Service Settings'}
        </Button>
      </CardFooter>
    </Card>
  );
}
