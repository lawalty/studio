
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from "@/hooks/use-toast";
import { Save, Speech, MessageSquare, Terminal } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Separator } from '@/components/ui/separator';

interface ApiKeys {
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
          Manage keys for third-party services like Twilio SMS and custom Text-to-Speech.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p>Loading settings...</p>
        ) : (
          <>
            <Alert variant="default" className="bg-sky-50 border-sky-200">
              <Terminal className="h-4 w-4 text-sky-700" />
              <AlertTitle className="text-sky-800 font-bold">Important: Google AI Authentication</AlertTitle>
              <AlertDescription className="text-sky-700 space-y-3">
                  <p className="font-semibold">
                    All Google Cloud and AI features in this app (chat, knowledge base, etc.) use Service Account credentials.
                  </p>
                  <p>
                    You do **not** need to set a `GOOGLE_AI_API_KEY` environment variable. The application automatically and securely authenticates using the permissions of the service account it's running under in your Google Cloud project.
                  </p>
                  <p>
                    Please ensure the service account has the required IAM roles as described in the README file.
                  </p>
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
