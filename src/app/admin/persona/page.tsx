
'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from "@/hooks/use-toast";
import { Save, UploadCloud, Bot, MessageSquareText, Type, Timer, Film, ListOrdered, Link2 } from 'lucide-react';
import { adjustAiPersonaAndPersonality, type AdjustAiPersonaAndPersonalityInput } from '@/ai/flows/persona-personality-tuning';
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, setDoc } from 'firebase/firestore';

const DEFAULT_AVATAR_PLACEHOLDER = "https://placehold.co/150x150.png";
const DEFAULT_ANIMATED_AVATAR_PLACEHOLDER = "https://placehold.co/150x150.png?text=GIF";
const AVATAR_FIREBASE_STORAGE_PATH = "site_assets/avatar_image";
const ANIMATED_AVATAR_FIREBASE_STORAGE_PATH = "site_assets/animated_avatar_image";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const DEFAULT_PERSONA_TRAITS_TEXT = "You are AI Blair, a knowledgeable and helpful assistant specializing in the pawn store industry. You are professional, articulate, and provide clear, concise answers based on your knowledge base. Your tone is engaging and conversational.";
const DEFAULT_CONVERSATIONAL_TOPICS = "Pawn industry regulations, Customer service best practices, Product valuation, Store operations and security";
const DEFAULT_CUSTOM_GREETING = "";
const DEFAULT_RESPONSE_PAUSE_TIME_MS = 750;
const DEFAULT_ANIMATION_SYNC_FACTOR = 0.9;


export default function PersonaPage() {
  const [personaTraits, setPersonaTraits] = useState(DEFAULT_PERSONA_TRAITS_TEXT);
  const [conversationalTopics, setConversationalTopics] = useState(DEFAULT_CONVERSATIONAL_TOPICS);
  const [avatarPreview, setAvatarPreview] = useState<string>(DEFAULT_AVATAR_PLACEHOLDER);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [animatedAvatarPreview, setAnimatedAvatarPreview] = useState<string>(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);
  const [selectedAnimatedAvatarFile, setSelectedAnimatedAvatarFile] = useState<File | null>(null);
  const [useKnowledgeInGreeting, setUseKnowledgeInGreeting] = useState<boolean>(true);
  const [customGreetingMessage, setCustomGreetingMessage] = useState<string>(DEFAULT_CUSTOM_GREETING);
  const [responsePauseTime, setResponsePauseTime] = useState<string>(String(DEFAULT_RESPONSE_PAUSE_TIME_MS));
  const [animationSyncFactor, setAnimationSyncFactor] = useState<string>(String(DEFAULT_ANIMATION_SYNC_FACTOR));


  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const animatedAvatarInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingData(true);
      try {
        const docRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setAvatarPreview(data?.avatarUrl || DEFAULT_AVATAR_PLACEHOLDER);
          setAnimatedAvatarPreview(data?.animatedAvatarUrl || DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);
          setPersonaTraits(data?.personaTraits || DEFAULT_PERSONA_TRAITS_TEXT);
          setConversationalTopics(data?.conversationalTopics || DEFAULT_CONVERSATIONAL_TOPICS);
          setUseKnowledgeInGreeting(typeof data?.useKnowledgeInGreeting === 'boolean' ? data.useKnowledgeInGreeting : true);
          setCustomGreetingMessage(data?.customGreetingMessage || DEFAULT_CUSTOM_GREETING);
          setResponsePauseTime(data?.responsePauseTimeMs === undefined ? String(DEFAULT_RESPONSE_PAUSE_TIME_MS) : String(data.responsePauseTimeMs));
          setAnimationSyncFactor(data?.animationSyncFactor === undefined ? String(DEFAULT_ANIMATION_SYNC_FACTOR) : String(data.animationSyncFactor));
        } else {
          // If doc doesn't exist, set all to defaults
          setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);
          setAnimatedAvatarPreview(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);
          setPersonaTraits(DEFAULT_PERSONA_TRAITS_TEXT);
          setConversationalTopics(DEFAULT_CONVERSATIONAL_TOPICS);
          setUseKnowledgeInGreeting(true);
          setCustomGreetingMessage(DEFAULT_CUSTOM_GREETING);
          setResponsePauseTime(String(DEFAULT_RESPONSE_PAUSE_TIME_MS));
          setAnimationSyncFactor(String(DEFAULT_ANIMATION_SYNC_FACTOR));
        }
      } catch (error) {
        console.error("Error fetching site assets from Firestore:", error);
        // Fallback to defaults on error
        setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);
        setAnimatedAvatarPreview(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);
        setPersonaTraits(DEFAULT_PERSONA_TRAITS_TEXT);
        setConversationalTopics(DEFAULT_CONVERSATIONAL_TOPICS);
        setUseKnowledgeInGreeting(true);
        setCustomGreetingMessage(DEFAULT_CUSTOM_GREETING);
        setResponsePauseTime(String(DEFAULT_RESPONSE_PAUSE_TIME_MS));
        setAnimationSyncFactor(String(DEFAULT_ANIMATION_SYNC_FACTOR));
        toast({
          title: "Error Loading Data",
          description: "Could not fetch persona data from the database. Using defaults.",
          variant: "destructive",
        });
      }
      setIsLoadingData(false);
    };
    fetchData();
  }, [toast]);

  const handlePersonaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPersonaTraits(e.target.value);
  };

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnimatedAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedAnimatedAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAnimatedAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleResponsePauseTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Correctly and simply update the state. Validation happens on save.
    setResponsePauseTime(e.target.value);
  };
  
  const handleAnimationSyncFactorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAnimationSyncFactor(e.target.value);
  };


  const handleSaveAllSettings = async () => {
    setIsSaving(true);
    let personaUpdatedSuccessfully = false;
    
    try {
      const flowInput: AdjustAiPersonaAndPersonalityInput = { personaTraits };
      const { updatedPersonaDescription } = await adjustAiPersonaAndPersonality(flowInput);
      toast({ title: "AI Persona Updated", description: `AI Blair says: "${updatedPersonaDescription}"` });
      personaUpdatedSuccessfully = true;
    } catch (personaError: any) {
      console.error("[PersonaPage] Error calling AI to adjust persona:", personaError);
      toast({
        title: "AI Persona Update Failed",
        description: `The AI's personality could not be set. Your other settings were still saved. Error: ${personaError.message || 'Unknown'}.`,
        variant: "destructive",
        duration: 10000,
      });
    }

    const siteAssetsDocRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
    let newAvatarUrl = avatarPreview;
    let newAnimatedAvatarUrl = animatedAvatarPreview;
    let avatarUpdated = false;
    let animatedAvatarUpdated = false;

    // Handle static avatar upload/reset
    if (selectedAvatarFile) {
      const fileRef = storageRef(storage, AVATAR_FIREBASE_STORAGE_PATH);
      try {
        await uploadBytes(fileRef, selectedAvatarFile);
        newAvatarUrl = await getDownloadURL(fileRef);
        setAvatarPreview(newAvatarUrl); // Update preview with Firebase URL
        setSelectedAvatarFile(null); // Clear selected file
        avatarUpdated = true;
      } catch (uploadError: any) {
        toast({ title: "Static Avatar Upload Failed", description: `Could not upload: ${uploadError.message}`, variant: "destructive" });
        setIsSaving(false); return;
      }
    } else if (avatarPreview === DEFAULT_AVATAR_PLACEHOLDER) {
       newAvatarUrl = DEFAULT_AVATAR_PLACEHOLDER;
       avatarUpdated = true; 
    }


    // Handle animated avatar upload/reset
    if (selectedAnimatedAvatarFile) {
      const animatedFileRef = storageRef(storage, ANIMATED_AVATAR_FIREBASE_STORAGE_PATH);
      try {
        await uploadBytes(animatedFileRef, selectedAnimatedAvatarFile);
        newAnimatedAvatarUrl = await getDownloadURL(animatedFileRef);
        setAnimatedAvatarPreview(newAnimatedAvatarUrl); // Update preview with Firebase URL
        setSelectedAnimatedAvatarFile(null); // Clear selected file
        animatedAvatarUpdated = true;
      } catch (uploadError: any) {
        toast({ title: "Animated Avatar Upload Failed", description: `Could not upload GIF: ${uploadError.message}`, variant: "destructive" });
        setIsSaving(false); return;
      }
    } else if (animatedAvatarPreview === DEFAULT_ANIMATED_AVATAR_PLACEHOLDER) {
       newAnimatedAvatarUrl = DEFAULT_ANIMATED_AVATAR_PLACEHOLDER;
       animatedAvatarUpdated = true; 
    }


    const pauseTimeMs = parseInt(responsePauseTime, 10);
    const validPauseTime = isNaN(pauseTimeMs) || pauseTimeMs < 0 ? DEFAULT_RESPONSE_PAUSE_TIME_MS : pauseTimeMs;

    const syncFactor = parseFloat(animationSyncFactor);
    const validSyncFactor = isNaN(syncFactor) || syncFactor <= 0 ? DEFAULT_ANIMATION_SYNC_FACTOR : syncFactor;

    try {
      const currentDocSnap = await getDoc(siteAssetsDocRef);
      const currentData = currentDocSnap.data() || {};

      const dataToSave: { [key: string]: any } = {
        personaTraits,
        conversationalTopics,
        useKnowledgeInGreeting,
        customGreetingMessage: customGreetingMessage.trim() === "" ? "" : customGreetingMessage,
        responsePauseTimeMs: validPauseTime,
        animationSyncFactor: validSyncFactor,
      };

      if (avatarUpdated || newAvatarUrl !== currentData.avatarUrl) {
        dataToSave.avatarUrl = newAvatarUrl;
      }
      if (animatedAvatarUpdated || newAnimatedAvatarUrl !== currentData.animatedAvatarUrl) {
        dataToSave.animatedAvatarUrl = newAnimatedAvatarUrl;
      }

      await setDoc(siteAssetsDocRef, dataToSave, { merge: true });

      if(personaUpdatedSuccessfully) {
        toast({ title: "Persona Settings Saved", description: "Your settings have been saved to Firestore." });
      } else {
        toast({ title: "Persona Settings Saved (with AI error)", description: "Your settings were saved to Firestore, but the AI persona itself failed to update. See other error message for details." });
      }

    } catch (error) {
      console.error("Failed to save persona/avatars:", error);
      toast({ title: "Error Saving Settings", description: "Could not save all settings. Please check console.", variant: "destructive" });
    }

    setIsSaving(false);
  };

  const handleResetAvatar = async () => {
    setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);
    setSelectedAvatarFile(null); 
    if (avatarInputRef.current) avatarInputRef.current.value = ""; 
    toast({ title: "Static Avatar Preview Reset", description: "Preview reset. Click 'Save All Settings' to make it permanent."});
  };

  const handleResetAnimatedAvatar = async () => {
    setAnimatedAvatarPreview(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);
    setSelectedAnimatedAvatarFile(null); 
    if (animatedAvatarInputRef.current) animatedAvatarInputRef.current.value = ""; 
    toast({ title: "Animated Avatar Preview Reset", description: "Preview reset. Click 'Save All Settings' to make it permanent."});
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2"><Bot /> AI Persona &amp; Main Settings</CardTitle>
          <CardDescription>
            Define AI Blair&apos;s conversational style, traits, avatars, and other core interaction settings.
            All settings here are saved together in Firestore.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoadingData ? (<p>Loading persona settings...</p>) : (
            <>
              <div>
                <Label htmlFor="personaTraits" className="font-medium">Persona Traits Description</Label>
                <Textarea
                  id="personaTraits"
                  value={personaTraits}
                  onChange={handlePersonaChange}
                  placeholder="Describe AI Blair's personality, tone, knowledge areas, etc."
                  rows={8}
                  className="mt-1"
                  suppressHydrationWarning
                />
                <p className="text-xs text-muted-foreground mt-1">This description will be used by the AI to guide its responses.</p>
              </div>

              <div>
                <Label htmlFor="conversationalTopics" className="font-medium flex items-center gap-1.5"><ListOrdered className="h-4 w-4" /> Conversational Topics</Label>
                <Textarea
                  id="conversationalTopics"
                  value={conversationalTopics}
                  onChange={(e) => setConversationalTopics(e.target.value)}
                  placeholder="Enter topics separated by commas (e.g., Topic 1, Topic 2, Topic 3)"
                  rows={5}
                  className="mt-1"
                  suppressHydrationWarning
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter a comma-separated list (e.g., Topic 1, Topic 2). The space after the comma is optional but recommended for readability. This list will be used to categorize documents in the Knowledge Base.
                </p>
              </div>

              <div className="flex items-center space-x-3 rounded-md border p-3 shadow-sm">
                <MessageSquareText className="h-5 w-5 text-primary" />
                <div className="flex-1 space-y-1">
                    <Label htmlFor="useKnowledgeInGreeting" className="font-medium">
                        Tailor Initial Greeting with High Priority Knowledge
                    </Label>
                    <p className="text-xs text-muted-foreground">
                        If ON, AI Blair may reference topics from its High Priority Knowledge Base in its initial greeting.
                        If OFF (or if a Custom Scripted Greeting below is provided), this setting is overridden or unused for the initial greeting.
                    </p>
                </div>
                <Switch
                    id="useKnowledgeInGreeting"
                    checked={useKnowledgeInGreeting}
                    onCheckedChange={setUseKnowledgeInGreeting}
                    aria-label="Toggle use of knowledge base in initial greeting"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customGreetingMessage" className="font-medium flex items-center gap-1.5">
                  <Type className="h-4 w-4" />
                  Custom Scripted Greeting (Optional)
                </Label>
                <Textarea
                  id="customGreetingMessage"
                  value={customGreetingMessage}
                  onChange={(e) => setCustomGreetingMessage(e.target.value)}
                  placeholder="Enter a specific greeting AI Blair should use. If empty, AI Blair will generate a greeting based on the toggle above."
                  rows={3}
                  className="mt-1"
                  suppressHydrationWarning
                />
                <p className="text-xs text-muted-foreground mt-1">
                  If you provide a greeting here, it will be used exactly as written, overriding the dynamic greeting generation.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="responsePauseTime" className="font-medium flex items-center gap-1.5">
                      <Timer className="h-4 w-4" />
                      User Speaking Pause Time (ms)
                  </Label>
                  <Input
                      id="responsePauseTime"
                      type="number"
                      value={responsePauseTime}
                      onChange={handleResponsePauseTimeChange}
                      placeholder="e.g., 750"
                      min="0"
                      step="50"
                      className="mt-1"
                      suppressHydrationWarning
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                      Pause after user stops speaking before AI processes input (Audio Only mode). Default: {DEFAULT_RESPONSE_PAUSE_TIME_MS}ms.
                  </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="animationSyncFactor" className="font-medium flex items-center gap-1.5">
                        <Link2 className="h-4 w-4" />
                        Audio-Text Animation Sync
                    </Label>
                    <Input
                        id="animationSyncFactor"
                        type="number"
                        value={animationSyncFactor}
                        onChange={handleAnimationSyncFactorChange}
                        placeholder="e.g., 0.9"
                        min="0.1"
                        max="2.0"
                        step="0.05"
                        className="mt-1"
                        suppressHydrationWarning
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Adjusts typing speed in Audio-Text mode to match audio length (API TTS only). &lt;1.0 is faster, &gt;1.0 is slower. Default: {DEFAULT_ANIMATION_SYNC_FACTOR}.
                    </p>
                </div>
              </div>


              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                <div>
                  <Label className="font-medium text-base block mb-2">Static Avatar Image</Label>
                  <CardDescription className="mb-3">
                    Default image for AI Blair. Optimal: Square (e.g., 300x300px).
                  </CardDescription>
                  <Card className="shadow-sm">
                    <CardContent className="pt-6 flex flex-col items-center space-y-3">
                        <Image
                          src={avatarPreview} alt="AI Blair Static Avatar Preview" width={150} height={150}
                          className="rounded-full border-2 border-primary shadow-md object-cover"
                          data-ai-hint={avatarPreview === DEFAULT_AVATAR_PLACEHOLDER || avatarPreview.includes("placehold.co") ? "professional woman" : undefined}
                          key={`static-avatar-${avatarPreview.substring(0,30)}`}
                          unoptimized={avatarPreview.startsWith('data:image/') || avatarPreview.startsWith('blob:') || !avatarPreview.startsWith('https://')}
                          onError={() => { console.warn("Custom static avatar failed to load, falling back."); setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);}}
                        />
                      <Input type="file" accept="image/png, image/jpeg, image/webp" ref={avatarInputRef} onChange={handleAvatarChange} className="hidden" id="avatar-upload"/>
                      <Button variant="outline" size="sm" onClick={() => avatarInputRef.current?.click()}><UploadCloud className="mr-2 h-4 w-4"/> Choose Image</Button>
                      {selectedAvatarFile && <p className="text-xs text-muted-foreground">New: {selectedAvatarFile.name}</p>}
                      <Button variant="link" size="sm" onClick={handleResetAvatar} className="text-xs">Reset to default</Button>
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <Label className="font-medium text-base block mb-2 flex items-center gap-1.5"><Film /> Animated Speaking Avatar (GIF)</Label>
                  <CardDescription className="mb-3">
                    Upload an animated GIF for when AI Blair is speaking in audio modes.
                  </CardDescription>
                  <Card className="shadow-sm">
                    <CardContent className="pt-6 flex flex-col items-center space-y-3">
                        <Image
                          src={animatedAvatarPreview} alt="AI Blair Animated Avatar Preview" width={150} height={150}
                          className="rounded-full border-2 border-accent shadow-md object-cover"
                          data-ai-hint={animatedAvatarPreview === DEFAULT_ANIMATED_AVATAR_PLACEHOLDER || animatedAvatarPreview.includes("placehold.co") ? "animated face" : undefined}
                          key={`animated-avatar-${animatedAvatarPreview.substring(0,30)}`}
                          unoptimized={true}
                          onError={() => { console.warn("Custom animated avatar failed to load, falling back."); setAnimatedAvatarPreview(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);}}
                        />
                      <Input type="file" accept="image/gif" ref={animatedAvatarInputRef} onChange={handleAnimatedAvatarChange} className="hidden" id="animated-avatar-upload"/>
                      <Button variant="outline" size="sm" onClick={() => animatedAvatarInputTef.current?.click()}><UploadCloud className="mr-2 h-4 w-4"/>Choose GIF</Button>
                      {selectedAnimatedAvatarFile && <p className="text-xs text-muted-foreground">New: {selectedAnimatedAvatarFile.name}</p>}
                      <Button variant="link" size="sm" onClick={handleResetAnimatedAvatar} className="text-xs">Reset to default</Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSaveAllSettings} disabled={isSaving || isLoadingData} size="lg">
            <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Saving All Persona Settings...' : (isLoadingData ? 'Loading...' : 'Save All Persona Settings')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
