
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Terminal, CheckCircle, AlertTriangle, Activity, DatabaseZap, Loader2, Search, FileText, Bookmark, Heading2, Info, Wrench, Send, Timer, Volume2, Bot, User, Trash2, SendHorizontal, MessageSquare } from 'lucide-react';
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
import AdminNav from '@/components/admin/AdminNav';
import { generateChatResponse, type GenerateChatResponseInput, type GenerateChatResponseOutput } from '@/ai/flows/generate-chat-response';


interface TtsConfig {
  tts: string;
  voiceId: string;
  useTtsApi: boolean;
}

interface TestMessage {
  role: 'user' | 'model';
  text: string;
}

const FIRESTORE_APP_CONFIG_PATH = "configurations/app_config";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const DEFAULT_RESPONSE_PAUSE_TIME_MS = 750;


export default function ApiKeysPage() {
  const [distanceThreshold, setDistanceThreshold] = useState(0.8);
  const [isLoading, setIsLoading] = useState(true);
  const [responsePauseTime, setResponsePauseTime] = useState(DEFAULT_RESPONSE_PAUSE_TIME_MS);
  const [ttsConfig, setTtsConfig] = useState<TtsConfig>({ tts: '', voiceId: '', useTtsApi: false });
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

  // State for Test Chat
  const [inputValue, setInputValue] = useState('');
  const [chatHistory, setChatHistory] = useState<TestMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [clarificationAttemptCount, setClarificationAttemptCount] = useState(0);

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
          setDistanceThreshold(typeof data.distanceThreshold === 'number' ? data.distanceThreshold : 0.8);
          setTtsConfig({
            tts: data.tts || '',
            voiceId: data.voiceId || '',
            useTtsApi: typeof data.useTtsApi === 'boolean' ? data.useTtsApi : false,
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
    const result = await testSearch({ query: searchQuery, distanceThreshold: distanceThreshold });
    setSearchResult(result);
    setIsTesting(prev => ({ ...prev, search: false }));
  };

  const handleRunHoldMessageTest = () => {
    if (isTesting.holdMessage) return;

    setIsTesting(prev => ({...prev, holdMessage: true}));
    setHoldMessageTimer(0);
    const startTime = Date.now();
    
    if(holdMessageIntervalRef.current) clearInterval(holdMessageIntervalRef.current);

    holdMessageIntervalRef.current = setInterval(async () => {
        const elapsedTime = Date.now() - startTime;
        setHoldMessageTimer(elapsedTime);

        if (elapsedTime >= responsePauseTime) {
            clearInterval(holdMessageIntervalRef.current!);
            holdMessageIntervalRef.current = null;
            toast({ title: 'Hold message triggered!', description: `Playing audio after ${responsePauseTime}ms.` });

            try {
                const result = await generateHoldMessage({ 
                    language: 'English',
                    useCustomTts: ttsConfig.useTtsApi,
                    ttsApiKey: ttsConfig.tts,
                    ttsVoiceId: ttsConfig.voiceId,
                });
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

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim()) {
      toast({ title: "Input is empty", description: "Please enter a message to send.", variant: "destructive" });
      return;
    }
    
    setIsSending(true);

    const newHistory: TestMessage[] = [...chatHistory, { role: 'user', text: inputValue }];
    setChatHistory(newHistory);
    const currentUserInput = inputValue;
    setInputValue('');

    const historyForGenkit = newHistory.map(msg => ({
      role: msg.role,
      content: [{ text: msg.text }]
    }));

    try {
      // NOTE: For testing purposes, we send minimal persona info.
      // The flow has defaults if the persona info is missing from the config documents.
      const flowInput: GenerateChatResponseInput = {
        personaTraits: "A helpful AI assistant.",
        personalBio: "I am a testing AI.",
        conversationalTopics: "General",
        chatHistory: historyForGenkit,
        language: 'English',
        communicationMode: 'text-only',
        clarificationAttemptCount: clarificationAttemptCount,
      };
      
      const result: GenerateChatResponseOutput = await generateChatResponse(flowInput);
      
      if (result.isClarificationQuestion) {
          setClarificationAttemptCount(prev => prev + 1);
      } else {
          setClarificationAttemptCount(0); // Reset on a direct answer
      }

      setChatHistory(prev => [...prev, { role: 'model', text: result.aiResponse }]);

    } catch (error: any) {
      console.error("Error calling generateChatResponse:", error);
      toast({
        title: "Error",
        description: `An error occurred: ${error.message}`,
        variant: "destructive",
      });
      // Roll back the user message if the API call fails
      setChatHistory(prev => prev.slice(0, -1));
      setInputValue(currentUserInput);
    } finally {
      setIsSending(false);
    }
  }, [inputValue, chatHistory, toast, clarificationAttemptCount]);

  const handleReset = () => {
    setChatHistory([]);
    setInputValue('');
    setClarificationAttemptCount(0);
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
          <CardTitle className="font-headline">Diagnostics & Test</CardTitle>
          <CardDescription>
            Use these tools to diagnose issues with core services and test conversational context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading settings...</p>
          ) : (
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
          )}
        </CardContent>
      </Card>
      
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Test Conversational Context</CardTitle>
          <CardDescription>
            Use this page to test the AI&apos;s ability to remember context within a single conversation. 
            Each message sent includes the full history above it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <Label>Conversation History</Label>
                    <Button variant="ghost" size="sm" onClick={handleReset}>
                        <Trash2 className="mr-2 h-4 w-4" /> Reset
                    </Button>
                </div>
                <ScrollArea className="h-96 w-full rounded-md border p-4 space-y-4">
                    {chatHistory.length === 0 ? (
                        <p className="text-muted-foreground text-center">Conversation is empty. Send a message to begin.</p>
                    ) : (
                        chatHistory.map((msg, index) => (
                            <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                {msg.role === 'model' && <Bot className="h-6 w-6 text-primary flex-shrink-0" />}
                                <div className={`max-w-xl rounded-lg p-3 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                    <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                                </div>
                                {msg.role === 'user' && <User className="h-6 w-6 text-primary flex-shrink-0" />}
                            </div>
                        ))
                    )}
                </ScrollArea>
            </div>
            <Separator />
            <div className="space-y-2">
                <Label htmlFor="message-input">User Message</Label>
                <div className="flex gap-2">
                    <Input
                        id="message-input"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Type your message here to test the next turn..."
                        onKeyDown={(e) => { if (e.key === 'Enter' && !isSending) handleSendMessage(); }}
                        disabled={isSending}
                    />
                    <Button onClick={handleSendMessage} disabled={isSending}>
                        {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizontal className="mr-2 h-4 w-4" />}
                        Send
                    </Button>
                </div>
            </div>
        </CardContent>
        <CardFooter>
            <CardDescription>
                Example Scenario: 1) AI asks a question with options. 2) You reply with one option (e.g., &quot;Sales&quot;). 3) AI should understand the context and ask a relevant follow-up.
            </CardDescription>
        </CardFooter>
      </Card>

    </div>
  );
}
