
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from "@/hooks/use-toast";
import { Save, Speech, KeyRound, Terminal, CheckCircle, AlertTriangle, Activity, DatabaseZap, Loader2, Search, FileText, Volume2, Bookmark, Heading2, SlidersHorizontal, Info, Wrench } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Separator } from '@/components/ui/separator';
import { testTextGeneration, type TestTextGenerationOutput } from '@/ai/flows/test-text-generation-flow';
import { testEmbedding, type TestEmbeddingOutput } from '@/ai/flows/test-embedding-flow';
import { testFirestoreWrite, type TestFirestoreWriteOutput } from '@/ai/flows/test-firestore-write-flow';
import { testSearch, type TestSearchOutput, type SearchResult } from '@/ai/flows/test-search-flow';
import { textToSpeech as googleTextToSpeech } from '@/ai/flows/text-to-speech-flow';
import { elevenLabsTextToSpeech } from '@/ai/flows/eleven-labs-tts-flow';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';

interface AppConfig {
  tts: string;
  voiceId: string;
  useTtsApi: boolean;
  distanceThreshold: number;
}

const FIRESTORE_CONFIG_PATH = "configurations/app_config";

export default function ApiKeysPage() {
  const [config, setConfig] = useState<AppConfig>({
    tts: '',
    voiceId: '',
    useTtsApi: true,
    distanceThreshold: 0.6,
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
    const fetchConfig = async () => {
      setIsLoading(true);
      try {
        const docRef = doc(db, FIRESTORE_CONFIG_PATH);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setConfig({
            tts: data.tts || '',
            voiceId: data.voiceId || '',
            useTtsApi: typeof data.useTtsApi === 'boolean' ? data.useTtsApi : true,
            distanceThreshold: typeof data.distanceThreshold === 'number' ? data.distanceThreshold : 0.6,
          });
        }
      } catch (error) {
        console.error("Error fetching config from Firestore:", error);
        toast({
          title: "Error Loading Settings",
          description: "Could not fetch settings from the database.",
          variant: "destructive",
        });
      }
      setIsLoading(false);
    };
    fetchConfig();
  }, [toast]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
  };

  const handleSwitchChange = (checked: boolean) => {
    setConfig({ ...config, useTtsApi: checked });
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const docRef = doc(db, FIRESTORE_CONFIG_PATH);
      await setDoc(docRef, config, { merge: true }); 
      toast({ title: "Settings Saved", description: "Your API Key and RAG settings have been saved to Firestore." });
    } catch (error) {
      console.error("Error saving config to Firestore:", error);
      toast({
        title: "Error Saving Settings",
        description: "Could not save settings to the database.",
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
      if (config.useTtsApi && config.tts && config.voiceId) {
          const result = await elevenLabsTextToSpeech({ text: testText, apiKey: config.tts, voiceId: config.voiceId });
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
    const result = await testSearch({ query: searchQuery, distanceThreshold: config.distanceThreshold });
    setSearchResult(result);
    setIsTesting(prev => ({ ...prev, search: false }));
  };

  const getBadgeVariant = (level: string) => {
    switch (level) {
      case 'High': return 'destructive';
      case 'Medium': return 'secondary';
      default: return 'outline';
    }
  };
  
  const getSearchResultAlert = () => {
    if (!searchResult) return null;
    
    let variant: "default" | "destructive" | "warning" = "default";
    let title = "";
    let icon = <CheckCircle className="h-4 w-4" />;

    if (searchResult.success) {
      variant = "default";
      title = "Success";
      icon = <CheckCircle className="h-4 w-4" />;
    } else if (searchResult.error) {
      variant = "destructive";
      title = "Search Failed";
      icon = <AlertTriangle className="h-4 w-4" />;
    } else {
      variant = "warning" as any;
      title = "No Results Found";
      icon = <Info className="h-4 w-4" />;
    }

    return (
        <Alert className="mt-4" variant={variant}>
            {icon}
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription className="text-xs break-words">
                {searchResult.message}
                {searchResult.error && <p className="mt-2 font-mono bg-red-50 p-2 rounded">Technical Details: {searchResult.error}</p>}
            </AlertDescription>
        </Alert>
    );
  };
  
  const renderDiagnostics = () => {
      if (!searchResult || !searchResult.diagnostics) return null;
      const { diagnostics } = searchResult;
      return (
          <div className="mt-4 p-3 rounded-md border bg-muted/50">
              <h4 className="font-semibold text-sm mb-2">Diagnostics</h4>
              <div className="text-xs space-y-1">
                  {diagnostics.totalChunksFound !== undefined && (
                      <p><span className="font-medium">Total Chunks Found in DB:</span> {diagnostics.totalChunksFound}</p>
                  )}
                  <p><span className="font-medium">Preprocessed Query:</span> "{diagnostics.preprocessedQuery}"</p>
                  <p><span className="font-medium">Query Embedding Generated:</span> {diagnostics.embeddingGenerated ? 'Yes' : 'No'}</p>
                  {diagnostics.embeddingSnippet && <p><span className="font-medium">Embedding Snippet:</span> {diagnostics.embeddingSnippet}</p>}
              </div>
          </div>
      );
  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">API Key &amp; Services Management</CardTitle>
          <CardDescription>
            Manage keys for AI services and tune Retrieval-Augmented Generation (RAG) settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <p>Loading settings...</p>
          ) : (
            <>
              <Alert variant="default" className="bg-sky-50 border-sky-200">
                <Terminal className="h-4 w-4 text-sky-700" />
                <AlertTitle className="text-sky-800 font-bold">Important: Google AI Configuration</AlertTitle>
                <AlertDescription className="text-sky-700 space-y-3">
                    <p>
                      Your Google AI API Key is managed via an environment variable for security.
                    </p>
                    <ul className="list-disc pl-5 text-xs space-y-1">
                        <li>For local development, add your `GEMINI_API_KEY` to your <code className="font-mono bg-sky-100 p-1 rounded">.env.local</code> file.</li>
                        <li>For production, set this as a secret in your hosting provider&apos;s dashboard. See `apphosting.yaml` for the required secret name.</li>
                    </ul>
                </AlertDescription>
              </Alert>

              <Separator className="my-6" />
              
              <div className="flex items-center gap-2 mb-2">
                  <Speech className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Custom Text-to-Speech (TTS)</h3>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ttsKey" className="font-medium">Custom TTS API Key (e.g., Elevenlabs)</Label>
                <Input id="ttsKey" name="tts" type="password" value={config.tts} onChange={handleChange} placeholder="Enter TTS API Key" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="voiceId" className="font-medium">Custom TTS Voice ID</Label>
                <Input id="voiceId" name="voiceId" value={config.voiceId} onChange={handleChange} placeholder="Enter Voice ID for TTS" />
              </div>
                <div className="flex items-center space-x-3 rounded-md border p-3 shadow-sm">
                  <div className="flex-1 space-y-1">
                      <Label htmlFor="useTtsApi" className="font-medium">
                          Use Custom TTS API
                      </Label>
                      <p className="text-xs text-muted-foreground">
                          If ON, uses the custom TTS. If OFF, uses the default Google voice.
                      </p>
                  </div>
                  <Switch
                      id="useTtsApi"
                      checked={config.useTtsApi}
                      onCheckedChange={handleSwitchChange}
                      aria-label="Toggle Custom TTS API usage"
                  />
              </div>
              <Button onClick={handleTestTts} disabled={isLoading || isTestingTts} variant="outline" size="sm">
                  {isTestingTts ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Volume2 className="mr-2 h-4 w-4" />}
                  Test TTS Voice
              </Button>

              <Separator className="my-6" />

              <div>
                <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">RAG Tuning</h3>
                </div>
                <CardDescription className="mb-4">
                    Adjust the similarity threshold for the Firestore vector search.
                </CardDescription>
                <div>
                    <Label htmlFor="distance-slider" className="font-medium">
                    Distance Threshold: {config.distanceThreshold.toFixed(2)}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                    Lower values mean stricter, more relevant results (closer to 0). Higher values are more lenient (closer to 1). Default is 0.6.
                    </p>
                </div>
                <Slider
                    id="distance-slider"
                    min={0.1}
                    max={1}
                    step={0.01}
                    value={[config.distanceThreshold]}
                    onValueChange={(value) => setConfig(prev => ({ ...prev, distanceThreshold: value[0] }))}
                    className="mt-2"
                />
              </div>
            </>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={isLoading}>
            <Save className="mr-2 h-4 w-4" /> {isLoading ? 'Saving...' : 'Save All Settings'}
          </Button>
        </CardFooter>
      </Card>

      <Separator />

      <div className="px-6 pb-6 space-y-6">
        <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Core Service Diagnostics</h3>
        </div>
        <CardDescription>
            Run tests to diagnose issues with your Google AI API key or project configuration.
        </CardDescription>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Terminal className="h-4 w-4" />
                        Text Generation Test
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Tests basic connectivity to the Gemini model.
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
                        Tests connectivity to the text embedding model.
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
                                {embeddingResult.success ? `Generated embedding with ${embeddingResult.embeddingVectorLength} dimensions.` : embeddingResult.error}
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
                        Tests if the server can write to Firestore.
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
                                {firestoreResult.success ? `Successfully wrote to Firestore.` : firestoreResult.error}
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      Vector Search Test (RAG)
                  </CardTitle>
                  <CardDescription className="text-xs">
                      Tests the RAG pipeline using Firestore's native vector search. Uses the saved distance threshold.
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
                        {getSearchResultAlert()}
                        {renderDiagnostics()}
                        {searchResult.results && searchResult.results.length > 0 && (
                            <ScrollArea className="mt-4 h-64 w-full rounded-md border p-3">
                                {searchResult.results.map((res, i) => (
                                  <div key={i} className="text-xs p-2 border-b last:border-b-0 space-y-2">
                                      <div className="flex justify-between items-start">
                                        <p className="font-semibold text-primary flex items-center gap-1.5"><FileText size={12}/> {res.sourceName}</p>
                                        <div className="flex items-center gap-2">
                                            <Badge variant={getBadgeVariant(res.level)}>{res.level}</Badge>
                                            <span className="text-muted-foreground/80 font-mono text-[10px]">{res.distance.toFixed(3)}</span>
                                        </div>
                                      </div>

                                      <div className="pl-2 space-y-1 text-muted-foreground">
                                          {res.title && <p className="flex items-center gap-1.5"><Bookmark size={10} /> Title: {res.title}</p>}
                                          {res.header && <p className="flex items-center gap-1.5"><Heading2 size={10} /> Header: {res.header}</p>}
                                          {typeof res.pageNumber === 'number' && <p>Page: {res.pageNumber}</p>}
                                      </div>
                                      
                                      <p className="text-muted-foreground mt-1 line-clamp-3 bg-slate-50 p-2 rounded">"{res.text}"</p>
                                      
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
    </div>
  );
}
