
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from "@/hooks/use-toast";
import { Save, Speech, KeyRound, Terminal, CheckCircle, AlertTriangle, Activity, DatabaseZap, Loader2, Search, FileText, Volume2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Separator } from '@/components/ui/separator';
import { testTextGeneration, type TestTextGenerationOutput } from '@/ai/flows/test-text-generation-flow';
import { testEmbedding, type TestEmbeddingOutput } from '@/ai/flows/test-embedding-flow';
import { testFirestoreWrite, type TestFirestoreWriteOutput } from '@/ai/flows/test-firestore-write-flow';
import { testSearch, type TestSearchOutput, type SearchResult } from '@/ai/flows/test-search-flow';
import { textToSpeech as googleTextToSpeech } from '@/ai/flows/text-to-speech-flow';
import { elevenLabsTextToSpeech } from '@/ai/flows/eleven-labs-tts-flow';

interface ApiKeys {
  tts: string;
  voiceId: string;
  useTtsApi: boolean;
}

const FIRESTORE_KEYS_PATH = "configurations/api_keys_config";

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({
    tts: '',
    voiceId: '',
    useTtsApi: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isTestingTts, setIsTestingTts] = useState(false);

  // State for diagnostics
  const [isTesting, setIsTesting] = useState<Record<string, boolean>>({});
  const [textGenResult, setTextGenResult] = useState<TestTextGenerationOutput | null>(null);
  const [embeddingResult, setEmbeddingResult] = useState<TestEmbeddingOutput | null>(null);
  const [firestoreResult, setFirestoreResult] = useState<TestFirestoreWriteOutput | null>(null);
  const [searchResult, setSearchResult] = useState<TestSearchOutput | null>(null);
  const [searchQuery, setSearchQuery] = useState('What is a pawnbroker?');

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
      const { ...keysToSave } = apiKeys;
      await setDoc(docRef, keysToSave, { merge: true }); 
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
  
  const handleTestTts = async () => {
    setIsTestingTts(true);
    toast({ title: 'Generating TTS Audio...', description: 'Please wait a moment.' });
    
    const testText = "This is a test of the custom text-to-speech voice.";

    try {
      let audioDataUri = '';
      if (apiKeys.useTtsApi && apiKeys.tts && apiKeys.voiceId) {
          const result = await elevenLabsTextToSpeech({ text: testText, apiKey: apiKeys.tts, voiceId: apiKeys.voiceId });
          if(result.error) throw new Error(result.error);
          audioDataUri = result.media;
      } else {
          const result = await googleTextToSpeech(testText);
          audioDataUri = result.media;
          toast({ title: 'Using Default Voice', description: 'Custom TTS is disabled or misconfigured. Testing the default Google voice.'})
      }

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      audioRef.current.src = audioDataUri;
      await audioRef.current.play();
      
    } catch (error: any) {
      console.error('Error testing TTS:', error);
      toast({ title: 'Error', description: `Could not play audio. ${error.message}`, variant: 'destructive' });
    } finally {
      setIsTestingTts(false);
    }
  };


  const handleRunTextGenTest = async () => {
    setIsTesting(prev => ({ ...prev, textGen: true }));
    setTextGenResult(null);
    const result = await testTextGeneration();
    setTextGenResult(result);
    setIsTesting(prev => ({ ...prev, textGen: false }));
  };

  const handleRunEmbeddingTest = async () => {
    setIsTesting(prev => ({ ...prev, embedding: true }));
    setEmbeddingResult(null);
    const result = await testEmbedding();
    setEmbeddingResult(result);
    setIsTesting(prev => ({ ...prev, embedding: false }));
  };

  const handleRunFirestoreTest = async () => {
    setIsTesting(prev => ({ ...prev, firestore: true }));
    setFirestoreResult(null);
    const result = await testFirestoreWrite();
    setFirestoreResult(result);
    setIsTesting(prev => ({ ...prev, firestore: false }));
  };
  
  const handleRunSearchTest = async () => {
    if (!searchQuery.trim()) {
      toast({ title: "Search Query Empty", description: "Please enter a query to test.", variant: "destructive" });
      return;
    }
    setIsTesting(prev => ({ ...prev, search: true }));
    setSearchResult(null);
    const result = await testSearch({ query: searchQuery });
    setSearchResult(result);
    setIsTesting(prev => ({ ...prev, search: false }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">API Key &amp; Services Management</CardTitle>
        <CardDescription>
          Manage keys for AI services.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p>Loading settings...</p>
        ) : (
          <>
            <Alert variant="default" className="bg-sky-50 border-sky-200">
              <Terminal className="h-4 w-4 text-sky-700" />
              <AlertTitle className="text-sky-800 font-bold">Important: Google AI API Key Configuration</AlertTitle>
              <AlertDescription className="text-sky-700 space-y-3">
                  <p>
                    To fix a persistent framework bug, the Google AI API Key is now managed exclusively via an environment variable.
                  </p>
                  <ul className="list-disc pl-5 text-xs space-y-1">
                      <li>For local development, add <code className="font-mono bg-sky-100 p-1 rounded">GEMINI_API_KEY=your_key_here</code> to your <code className="font-mono bg-sky-100 p-1 rounded">.env.local</code> file.</li>
                      <li>For production, set this as a secret in your hosting provider&apos;s dashboard (e.g., Firebase App Hosting Secrets).</li>
                  </ul>
                  <p className="text-xs">
                    The input field for this key has been removed from the UI to avoid confusion.
                  </p>
              </AlertDescription>
            </Alert>

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
            <Button onClick={handleTestTts} disabled={isLoading || isTestingTts} variant="outline" size="sm">
                {isTestingTts ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Volume2 className="mr-2 h-4 w-4" />}
                Test TTS Voice
            </Button>
          </>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={isLoading}>
          <Save className="mr-2 h-4 w-4" /> {isLoading ? 'Saving...' : 'Save Service Settings'}
        </Button>
      </CardFooter>

      <Separator className="my-8" />
      
      <div className="px-6 pb-6 space-y-6">
        <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Core Service Diagnostics</h3>
        </div>
        <CardDescription>
            Run these tests to diagnose issues with your Google AI API key or Google Cloud project configuration.
            Text extraction failures are often due to issues with the Text Generation or Embedding models.
        </CardDescription>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Terminal className="h-4 w-4" />
                        Text Generation Test
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Tests basic connectivity to the Gemini model using your API key.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleRunTextGenTest} disabled={isTesting.textGen}>
                        {isTesting.textGen && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Run Test
                    </Button>
                    {textGenResult && (
                        <Alert className="mt-4" variant={textGenResult.success ? "default" : "destructive"}>
                            {textGenResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                            <AlertTitle>{textGenResult.success ? "Success" : "Failed"}</AlertTitle>
                            <AlertDescription className="text-xs break-words">
                                {textGenResult.success ? `Model responded: "${textGenResult.generatedText}"` : textGenResult.error}
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <DatabaseZap className="h-4 w-4" />
                        Embedding Model Test
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Tests connectivity to the text embedding model required for RAG.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleRunEmbeddingTest} disabled={isTesting.embedding}>
                        {isTesting.embedding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Run Test
                    </Button>
                    {embeddingResult && (
                        <Alert className="mt-4" variant={embeddingResult.success ? "default" : "destructive"}>
                            {embeddingResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                            <AlertTitle>{embeddingResult.success ? "Success" : "Failed"}</AlertTitle>
                            <AlertDescription className="text-xs break-words">
                                {embeddingResult.success ? `Successfully generated an embedding with ${embeddingResult.embeddingVectorLength} dimensions.` : embeddingResult.error}
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <KeyRound className="h-4 w-4" />
                        Server Authentication Test
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Tests if the server can write to Firestore using its configured credentials (e.g., from Application Default Credentials or a service account).
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleRunFirestoreTest} disabled={isTesting.firestore}>
                        {isTesting.firestore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Run Test
                    </Button>
                    {firestoreResult && (
                        <Alert className="mt-4" variant={firestoreResult.success ? "default" : "destructive"}>
                            {firestoreResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                            <AlertTitle>{firestoreResult.success ? "Success" : "Failed"}</AlertTitle>
                            <AlertDescription className="text-xs break-words whitespace-pre-wrap">
                                {firestoreResult.success ? `Successfully authenticated and wrote to Firestore.` : firestoreResult.error}
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Search className="h-4 w-4" />
                        Vector Search Test
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Tests the full RAG pipeline by sending a query to your Vertex AI Vector Search index.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                      <Label htmlFor="search-query">Test Query</Label>
                      <Input id="search-query" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    <Button onClick={handleRunSearchTest} disabled={isTesting.search} className="mt-2">
                        {isTesting.search && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Run RAG Test
                    </Button>
                    {searchResult && (
                      <div className="mt-4">
                        <Alert variant={searchResult.error ? "destructive" : "default"}>
                            {searchResult.error ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                            <AlertTitle>{searchResult.error ? "Search Failed" : "Search Succeeded"}</AlertTitle>
                            <AlertDescription className="text-xs break-words">
                                {searchResult.error ? searchResult.error : `Found ${searchResult.results.length} relevant document(s).`}
                            </AlertDescription>
                        </Alert>
                        {searchResult.results && searchResult.results.length > 0 && (
                            <ScrollArea className="mt-4 h-48 w-full rounded-md border p-3">
                                {searchResult.results.map((res, i) => (
                                  <div key={i} className="text-xs p-2 border-b last:border-b-0">
                                      <p className="font-semibold text-primary flex items-center gap-1"><FileText size={12}/> {res.sourceName}</p>
                                      <p className="text-muted-foreground mt-1 line-clamp-2">"{res.text}"</p>
                                      <p className="text-right text-muted-foreground/80 mt-1">Similarity: {res.distance.toFixed(3)}</p>
                                  </div>
                                ))}
                            </ScrollArea>
                        )}
                      </div>
                    )}
                </CardContent>
            </Card>
        </div>
      </div>
    </Card>
  );
}

    