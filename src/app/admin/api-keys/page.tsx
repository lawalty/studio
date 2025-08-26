
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { Save, KeyRound, Terminal, CheckCircle, AlertTriangle, Activity, DatabaseZap, Loader2, Search, FileText, Bookmark, Heading2, SlidersHorizontal, Info, Wrench, Send, Timer, Volume2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Separator } from '@/components/ui/separator';
import { testTextGeneration, type TestTextGenerationOutput } from '@/ai/flows/test-text-generation-flow';
import { testEmbedding, type TestEmbeddingOutput } from '@/ai/flows/test-embedding-flow';
import { testFirestoreWrite, type TestFirestoreWriteOutput } from '@/ai/flows/test-firestore-write-flow';
import { testSearch, type TestSearchOutput, type SearchResult } from '@/ai/flows/test-search-flow';
import { generateHoldMessage } from '@/ai/flows/generate-hold-message-flow';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import AdminNav from '@/components/admin/AdminNav';

interface AppConfig {
  distanceThreshold: number;
}

const FIRESTORE_APP_CONFIG_PATH = "configurations/app_config";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const DEFAULT_RESPONSE_PAUSE_TIME_MS = 750;


export default function ApiKeysPage() {
  const [config, setConfig] = useState<AppConfig>({
    distanceThreshold: 0.8,
  });
  
  const [isSavingAppConfig, setIsSavingAppConfig] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [responsePauseTime, setResponsePauseTime] = useState(DEFAULT_RESPONSE_PAUSE_TIME_MS);
  const { toast } = useToast();

  // State for diagnostics
  const [isTesting, setIsTesting] = useState<Record<string, boolean>>({});
  const [textGenResult, setTextGenResult] = useState<TestTextGenerationOutput | null>(null);
  const [embeddingResult, setEmbeddingResult] = useState<TestEmbeddingOutput | null>(null);
  const [firestoreResult, setFirestoreResult] = useState<TestFirestoreWriteOutput | null>(null);
  const [searchResult, setSearchResult] = useState<TestSearchOutput | null>(null);
  const [searchQuery, setSearchQuery] = useState('What is a pawnbroker?');
  const [holdMessageTimer, setHoldMessageTimer] = useState<number | null>(null);
  const holdMessageIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const holdAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      setIsLoading(true);
      try {
        const appConfigDocRef = doc(db, FIRESTORE_APP_CONFIG_PATH);
        const siteAssetsDocRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);

        const [appConfigSnap, siteAssetsSnap] = await Promise.all([
            getDoc(appConfigDocRef),
            getDoc(siteAssetsDocRef)
        ]);

        if (appConfigSnap.exists()) {
          const data = appConfigSnap.data();
          setConfig({
            distanceThreshold: typeof data.distanceThreshold === 'number' ? data.distanceThreshold : 0.8,
          });
        }
        if (siteAssetsSnap.exists()) {
            const data = siteAssetsSnap.data();
            setResponsePauseTime(data.responsePauseTimeMs ?? DEFAULT_RESPONSE_PAUSE_TIME_MS);
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
  
  const handleSaveAppConfig = async () => {
      setIsSavingAppConfig(true);
      try {
          const appConfigDocRef = doc(db, FIRESTORE_APP_CONFIG_PATH);
          await setDoc(appConfigDocRef, { 
            distanceThreshold: config.distanceThreshold 
          }, { merge: true });
          
          toast({ title: "Settings Saved", description: "Your RAG settings have been saved to Firestore." });
      } catch (error) {
          console.error("Error saving config to Firestore:", error);
          toast({
              title: "Error Saving Settings",
              description: "Could not save settings to the database.",
              variant: "destructive",
          });
      }
      setIsSavingAppConfig(false);
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

  const handleRunHoldMessageTest = () => {
    if (isTesting.holdMessage) return;

    setIsTesting(prev => ({...prev, holdMessage: true}));
    setHoldMessageTimer(0);
    const startTime = Date.now();
    
    // Cleanup previous interval if it exists
    if(holdMessageIntervalRef.current) clearInterval(holdMessageIntervalRef.current);

    holdMessageIntervalRef.current = setInterval(async () => {
        const elapsedTime = Date.now() - startTime;
        setHoldMessageTimer(elapsedTime);

        if (elapsedTime >= responsePauseTime) {
            clearInterval(holdMessageIntervalRef.current!);
            holdMessageIntervalRef.current = null;
            toast({ title: 'Hold message triggered!', description: `Playing audio after ${responsePauseTime}ms.` });

            try {
                const result = await generateHoldMessage({ language: 'English' });
                if (result.error || !result.audioDataUri) throw new Error(result.error || "Flow failed to return audio");
                
                if (!holdAudioRef.current) holdAudioRef.current = new Audio();
                holdAudioRef.current.src = result.audioDataUri;
                await holdAudioRef.current.play();

            } catch (e: any) {
                toast({ title: 'Hold Message Error', description: e.message, variant: 'destructive' });
            } finally {
                setIsTesting(prev => ({ ...prev, holdMessage: false}));
                setHoldMessageTimer(null);
            }
        }
    }, 100);
  };
  

  const getSearchResultAlert = () => {
    if (!searchResult) return null;
    
    let variant: "default" | "destructive" = "default";
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
      variant = "default";
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
                  {diagnostics.usedDistanceThreshold !== undefined && (
                      <p><span className="font-medium">Distance Threshold Used:</span> {diagnostics.usedDistanceThreshold.toFixed(2)}</p>
                  )}
                  {diagnostics.totalChunksFound !== undefined && (
                      <p><span className="font-medium">Total Chunks Found in DB:</span> {diagnostics.totalChunksFound}</p>
                  )}
                  <p><span className="font-medium">Preprocessed Query:</span> &quot;{diagnostics.preprocessedQuery}&quot;</p>
                  <p><span className="font-medium">Query Embedding Generated:</span> {diagnostics.embeddingGenerated ? 'Yes' : 'No'}</p>
                  {diagnostics.embeddingSnippet && <p><span className="font-medium">Embedding Snippet:</span> {diagnostics.embeddingSnippet}</p>}
              </div>
          </div>
      );
  };


  return (
    <div className="space-y-6">
      <AdminNav />
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
                    Lower values mean stricter, more relevant results (closer to 0). Higher values are more lenient (closer to 1). Default is 0.8.
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
          <Button onClick={handleSaveAppConfig} disabled={isLoading || isSavingAppConfig}>
            <Save className="mr-2 h-4 w-4" /> {isSavingAppConfig ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardFooter>
      </Card>

      <Separator />

      <div className="space-y-6">
        <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Core Service Diagnostics</h3>
        </div>
        <CardDescription>
            Run tests to diagnose issues with your Google AI API key or project configuration.
        </CardDescription>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                      Tests the RAG pipeline using Firestore&apos;s native vector search. Uses the saved distance threshold.
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
                                            <Badge variant="outline">{res.level}</Badge>
                                            <Badge variant="secondary">{res.topic}</Badge>
                                            <span className="text-muted-foreground/80 font-mono text-[10px]">{res.distance.toFixed(3)}</span>
                                        </div>
                                      </div>

                                      <div className="pl-2 space-y-1 text-muted-foreground">
                                          {res.title && <p className="flex items-center gap-1.5"><Bookmark size={10} /> Title: {res.title}</p>}
                                          {res.header && <p className="flex items-center gap-1.5"><Heading2 size={10} /> Header: {res.header}</p>}
                                          {typeof res.pageNumber === 'number' && <p>Page: {res.pageNumber}</p>}
                                      </div>
                                      
                                      <p className="text-muted-foreground mt-1 line-clamp-3 bg-slate-50 p-2 rounded">&quot;{res.text}&quot;</p>
                                      
                                  </div>
                                ))}
                            </ScrollArea>
                        )}
                      </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Volume2 className="h-4 w-4" />
                        Hold Message Test
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Simulates the pause before the AI responds to trigger the &quot;give me a moment&quot; audio.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleRunHoldMessageTest} disabled={isTesting.holdMessage}>
                        {isTesting.holdMessage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Simulate User Response
                    </Button>
                    {isTesting.holdMessage && holdMessageTimer !== null && (
                        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                            <Timer className="h-4 w-4"/>
                            <span>Waiting: {Math.min(holdMessageTimer, responsePauseTime)}ms / {responsePauseTime}ms</span>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
