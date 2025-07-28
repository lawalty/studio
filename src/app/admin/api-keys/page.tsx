
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from "@/hooks/use-toast";
import { Save, Speech, KeyRound, Terminal, CheckCircle, AlertTriangle, Activity, DatabaseZap, Loader2, Search, FileText, Volume2, Bookmark, Heading2, SlidersHorizontal, Info } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


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
    distanceThreshold: 0.4,
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
            distanceThreshold: typeof data.distanceThreshold === 'number' ? data.distanceThreshold : 0.4,
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
      toast({ title: "Settings Saved", description: "Your settings have been saved to Firestore." });
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
    toast({ title: "Synthesizing test audio...", description: "Please wait..." });
    try {
        let audioDataUri = '';
        if (config.useTtsApi) {
            if (!config.tts || !config.voiceId) {
                throw new Error("ElevenLabs API Key and Voice ID must be provided to test custom TTS.");
            }
            const result = await elevenLabsTextToSpeech({ text: "This is a test of the ElevenLabs API.", apiKey: config.tts, voiceId: config.voiceId });
            if (result.error || !result.media) {
                throw new Error(result.error || "Custom TTS API returned no audio.");
            }
            audioDataUri = result.media;
        } else {
            const result = await googleTextToSpeech("This is a test of the standard Google text to speech model.");
            audioDataUri = result.media;
        }
        
        if (!audioRef.current) {
            audioRef.current = new Audio();
        }
        audioRef.current.src = audioDataUri;
        await audioRef.current.play();

    } catch (error: any) {
        console.error("Error testing TTS:", error);
        toast({ title: "TTS Test Failed", description: error.message, variant: "destructive" });
    }
    setIsTestingTts(false);
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">API Key &amp; Services Management</CardTitle>
          <CardDescription>
            Manage keys for AI services like Text-to-Speech (TTS) and enable/disable custom voice cloning.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <p>Loading settings...</p>
          ) : (
            <>
              <div className="flex items-center space-x-3 rounded-md border p-3 shadow-sm">
                  <Speech className="h-5 w-5 text-primary" />
                  <div className="flex-1 space-y-1">
                      <Label htmlFor="useTtsApi" className="font-medium">Use Custom ElevenLabs TTS API</Label>
                      <p className="text-xs text-muted-foreground">
                        If ON, the application will use the ElevenLabs API Key and Voice ID provided below for voice synthesis. 
                        If OFF, it will use the default Google TTS voice.
                      </p>
                  </div>
                  <Switch id="useTtsApi" checked={config.useTtsApi} onCheckedChange={handleSwitchChange} aria-label="Toggle custom TTS API"/>
              </div>

              <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="tts" className="flex items-center gap-2"><KeyRound/> ElevenLabs API Key</Label>
                    <Input id="tts" name="tts" type="password" value={config.tts} onChange={handleChange} placeholder="Enter your ElevenLabs API Key" disabled={!config.useTtsApi}/>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="voiceId" className="flex items-center gap-2"><Volume2/> ElevenLabs Voice ID</Label>
                    <Input id="voiceId" name="voiceId" value={config.voiceId} onChange={handleChange} placeholder="Enter the Voice ID for cloning" disabled={!config.useTtsApi}/>
                  </div>
                  <Button onClick={handleTestTts} variant="outline" size="sm" disabled={isTestingTts}>
                     {isTestingTts ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Speech className="mr-2 h-4 w-4" />}
                     Test TTS
                  </Button>
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

      <Separator />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">RAG Tuning</h3>
          </div>
          <CardDescription>
            Adjust the sensitivity of the vector search. This is a global setting that affects the chatbot.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="distance-slider" className="font-medium">
              Distance Threshold: {config.distanceThreshold.toFixed(2)}
               <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-5 w-5 ml-1">
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>This value controls how similar a document must be to the user's query to be included in the AI's answer. <strong>Smaller is stricter.</strong> A value of 0.20 requires a very high similarity, while 0.80 is very lenient.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
            </Label>
          </div>
          <Slider
            id="distance-slider"
            min={0.1}
            max={1}
            step={0.05}
            value={[config.distanceThreshold]}
            onValueChange={(value) => setConfig(prev => ({ ...prev, distanceThreshold: value[0] }))}
          />
        </CardContent>
        <CardFooter>
            <Button onClick={handleSave} disabled={isLoading}>
                <Save className="mr-2 h-4 w-4" /> {isLoading ? 'Saving...' : 'Save Tuning Settings'}
            </Button>
        </CardFooter>
      </Card>

      <Separator />

      <div className="space-y-6">
        <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Core Service Diagnostics</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><Terminal className="h-4 w-4" /> Text Generation</CardTitle>
                    <CardDescription className="text-xs">A minimal test to see if we can connect to a Gemini model.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleRunTextGenTest} disabled={isTesting.textGen}>
                        {isTesting.textGen && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Run Text Gen Test
                    </Button>
                    {textGenResult && (
                    <Alert className="mt-4" variant={textGenResult.success ? "default" : "destructive"}>
                        {textGenResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                        <AlertTitle>{textGenResult.success ? 'Success!' : 'Failed!'}</AlertTitle>
                        <AlertDescription>{textGenResult.generatedText || textGenResult.error}</AlertDescription>
                    </Alert>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><DatabaseZap className="h-4 w-4" /> Embedding Service</CardTitle>
                    <CardDescription className="text-xs">Checks if the embedding service returns a valid vector.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleRunEmbeddingTest} disabled={isTesting.embedding}>
                        {isTesting.embedding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Run Embedding Test
                    </Button>
                    {embeddingResult && (
                    <Alert className="mt-4" variant={embeddingResult.success ? "default" : "destructive"}>
                        {embeddingResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                        <AlertTitle>{embeddingResult.success ? 'Success!' : 'Failed!'}</AlertTitle>
                        <AlertDescription>
                            {embeddingResult.error ? embeddingResult.error : `Embedding generated successfully with ${embeddingResult.embeddingVectorLength} dimensions.`}
                        </AlertDescription>
                    </Alert>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> Firestore Write Access</CardTitle>
                    <CardDescription className="text-xs">Checks if the server has permission to write to Firestore.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleRunFirestoreTest} disabled={isTesting.firestore}>
                        {isTesting.firestore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Run Firestore Test
                    </Button>
                    {firestoreResult && (
                        <Alert className="mt-4" variant={firestoreResult.success ? "default" : "destructive"}>
                            {firestoreResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                            <AlertTitle>{firestoreResult.success ? 'Success!' : 'Failed!'}</AlertTitle>
                            <AlertDescription>{firestoreResult.error || 'Firestore write/delete test completed successfully.'}</AlertDescription>
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
                      Tests the full RAG pipeline using the tuned Distance Threshold set above.
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
                        {searchResult.error ? (
                          <Alert variant="destructive">
                              <AlertTriangle className="h-4 w-4" />
                              <AlertTitle>Search Failed</AlertTitle>
                              <AlertDescription>{searchResult.error}</AlertDescription>
                          </Alert>
                        ) : (
                          <Alert>
                              <CheckCircle className="h-4 w-4" />
                              <AlertTitle>Search Succeeded</AlertTitle>
                              <AlertDescription>
                                Found {searchResult.results.length} relevant document(s).
                                {searchResult.results.length > 0 && (
                                  <ScrollArea className="mt-2 h-48">
                                    <div className="space-y-2 pr-4">
                                      {searchResult.results.map((r: SearchResult, i: number) => (
                                          <div key={i} className="border p-2 rounded-md bg-background/50">
                                            <div className="flex justify-between items-start text-xs">
                                              <div className="font-semibold flex items-center gap-2">
                                                <FileText className="h-3 w-3" />
                                                <span className="truncate" title={r.sourceName}>{r.sourceName}</span>
                                              </div>
                                              <Badge variant={getBadgeVariant(r.level)}>{r.level}</Badge>
                                            </div>
                                            {r.title && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5"><Bookmark className="h-3 w-3" />{r.title}</p>}
                                            {r.header && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5"><Heading2 className="h-3 w-3" />{r.header}</p>}
                                            <p className="text-xs text-muted-foreground mt-1 font-mono">Dist: {r.distance.toFixed(4)}</p>
                                            <p className="text-sm mt-2 line-clamp-3">"{r.text}"</p>
                                          </div>
                                      ))}
                                    </div>
                                  </ScrollArea>
                                )}
                              </AlertDescription>
                          </Alert>
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
