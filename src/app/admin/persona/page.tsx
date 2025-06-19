
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
import { Save, UploadCloud, Bot, MessageSquareText, Type, Timer, Film, Link as LinkIcon, Copy } from 'lucide-react';
import { adjustAiPersonaAndPersonality, type AdjustAiPersonaAndPersonalityInput } from '@/ai/flows/persona-personality-tuning';
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const DEFAULT_AVATAR_PLACEHOLDER = "https://placehold.co/150x150.png";
const DEFAULT_ANIMATED_AVATAR_PLACEHOLDER = "https://placehold.co/150x150.png?text=GIF"; // Placeholder for GIF
const AVATAR_FIREBASE_STORAGE_PATH = "site_assets/avatar_image";
const ANIMATED_AVATAR_FIREBASE_STORAGE_PATH = "site_assets/animated_avatar_image";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const DEFAULT_PERSONA_TRAITS_TEXT = "You are AI Blair, a knowledgeable and helpful assistant specializing in the pawn store industry. You are professional, articulate, and provide clear, concise answers based on your knowledge base. Your tone is engaging and conversational.";
const DEFAULT_CUSTOM_GREETING = "";
const DEFAULT_RESPONSE_PAUSE_TIME_MS = 750;
const DEFAULT_PUBLIC_EMBED_URL = "";

export default function PersonaPage() {
  const [personaTraits, setPersonaTraits] = useState(DEFAULT_PERSONA_TRAITS_TEXT);
  const [avatarPreview, setAvatarPreview] = useState<string>(DEFAULT_AVATAR_PLACEHOLDER);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [animatedAvatarPreview, setAnimatedAvatarPreview] = useState<string>(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);
  const [selectedAnimatedAvatarFile, setSelectedAnimatedAvatarFile] = useState<File | null>(null);
  const [useKnowledgeInGreeting, setUseKnowledgeInGreeting] = useState<boolean>(true);
  const [customGreetingMessage, setCustomGreetingMessage] = useState<string>(DEFAULT_CUSTOM_GREETING);
  const [responsePauseTime, setResponsePauseTime] = useState<string>(String(DEFAULT_RESPONSE_PAUSE_TIME_MS));
  const [publicEmbedUrlInput, setPublicEmbedUrlInput] = useState<string>(DEFAULT_PUBLIC_EMBED_URL);
  const [currentPublicEmbedUrl, setCurrentPublicEmbedUrl] = useState<string>(DEFAULT_PUBLIC_EMBED_URL);


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
          setUseKnowledgeInGreeting(typeof data?.useKnowledgeInGreeting === 'boolean' ? data.useKnowledgeInGreeting : true);
          setCustomGreetingMessage(data?.customGreetingMessage || DEFAULT_CUSTOM_GREETING);
          setResponsePauseTime(data?.responsePauseTimeMs === undefined ? String(DEFAULT_RESPONSE_PAUSE_TIME_MS) : String(data.responsePauseTimeMs));
          const fetchedPublicUrl = data?.publicEmbedUrl || DEFAULT_PUBLIC_EMBED_URL;
          setPublicEmbedUrlInput(fetchedPublicUrl);
          setCurrentPublicEmbedUrl(fetchedPublicUrl);
        } else {
          // Set all to defaults if doc doesn't exist
          setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);
          setAnimatedAvatarPreview(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);
          setPersonaTraits(DEFAULT_PERSONA_TRAITS_TEXT);
          setUseKnowledgeInGreeting(true);
          setCustomGreetingMessage(DEFAULT_CUSTOM_GREETING);
          setResponsePauseTime(String(DEFAULT_RESPONSE_PAUSE_TIME_MS));
          setPublicEmbedUrlInput(DEFAULT_PUBLIC_EMBED_URL);
          setCurrentPublicEmbedUrl(DEFAULT_PUBLIC_EMBED_URL);
        }
      } catch (error) {
        console.error("Error fetching site assets from Firestore:", error);
        // Fallback to defaults on error
        setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);
        setAnimatedAvatarPreview(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);
        setPersonaTraits(DEFAULT_PERSONA_TRAITS_TEXT);
        setUseKnowledgeInGreeting(true);
        setCustomGreetingMessage(DEFAULT_CUSTOM_GREETING);
        setResponsePauseTime(String(DEFAULT_RESPONSE_PAUSE_TIME_MS));
        setPublicEmbedUrlInput(DEFAULT_PUBLIC_EMBED_URL);
        setCurrentPublicEmbedUrl(DEFAULT_PUBLIC_EMBED_URL);
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

  const handlePersonaChange = (e: React.ChangeEvent<Textarea>) => {
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
    const value = e.target.value;
    if (value === '' || /^\d*$/.test(value)) {
      setResponsePauseTime(value);
    }
  };

  const handlePublicEmbedUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPublicEmbedUrlInput(e.target.value);
  };

  const handleSavePublicEmbedUrl = async () => {
     setIsSaving(true);
     const siteAssetsDocRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
     try {
        const urlToSave = publicEmbedUrlInput.trim();
        const currentDocSnap = await getDoc(siteAssetsDocRef);
        if (currentDocSnap.exists()) {
            await updateDoc(siteAssetsDocRef, { publicEmbedUrl: urlToSave });
        } else {
            await setDoc(siteAssetsDocRef, { publicEmbedUrl: urlToSave }, { merge: true }); // merge to not overwrite other fields if somehow created by another process
        }
        setCurrentPublicEmbedUrl(urlToSave);
        toast({ title: "Public URL Saved", description: "The Public URL for embeds has been updated."});
     } catch (error) {
        console.error("Failed to save public embed URL:", error);
        toast({ title: "Error Saving URL", description: "Could not save the Public URL for embeds.", variant: "destructive" });
     }
     setIsSaving(false);
  };


  const handleSaveAllSettings = async () => {
    setIsSaving(true);

    const siteAssetsDocRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
    let newAvatarUrl = avatarPreview;
    let newAnimatedAvatarUrl = animatedAvatarPreview;
    let avatarUpdated = false;
    let animatedAvatarUpdated = false;

    if (selectedAvatarFile) {
      const fileRef = storageRef(storage, AVATAR_FIREBASE_STORAGE_PATH);
      try {
        await uploadBytes(fileRef, selectedAvatarFile);
        newAvatarUrl = await getDownloadURL(fileRef);
        setAvatarPreview(newAvatarUrl); 
        setSelectedAvatarFile(null);
        avatarUpdated = true;
      } catch (uploadError: any) {
        toast({ title: "Static Avatar Upload Failed", description: `Could not upload: ${uploadError.message}`, variant: "destructive" });
        setIsSaving(false); return;
      }
    } else if (avatarPreview === DEFAULT_AVATAR_PLACEHOLDER) {
       newAvatarUrl = DEFAULT_AVATAR_PLACEHOLDER; 
       avatarUpdated = true; 
    }


    if (selectedAnimatedAvatarFile) {
      const animatedFileRef = storageRef(storage, ANIMATED_AVATAR_FIREBASE_STORAGE_PATH);
      try {
        await uploadBytes(animatedFileRef, selectedAnimatedAvatarFile);
        newAnimatedAvatarUrl = await getDownloadURL(animatedFileRef);
        setAnimatedAvatarPreview(newAnimatedAvatarUrl); 
        setSelectedAnimatedAvatarFile(null);
        animatedAvatarUpdated = true;
      } catch (uploadError: any) {
        toast({ title: "Animated Avatar Upload Failed", description: `Could not upload GIF: ${uploadError.message}`, variant: "destructive" });
        setIsSaving(false); return;
      }
    } else if (animatedAvatarPreview === DEFAULT_ANIMATED_AVATAR_PLACEHOLDER) {
       newAnimatedAvatarUrl = DEFAULT_ANIMATED_AVATAR_PLACEHOLDER;
       animatedAvatarUpdated = true;
    }


    const pauseTimeMs = parseInt(responsePauseTime);
    const validPauseTime = isNaN(pauseTimeMs) || pauseTimeMs < 0 ? DEFAULT_RESPONSE_PAUSE_TIME_MS : pauseTimeMs;
    const finalPublicEmbedUrl = publicEmbedUrlInput.trim(); // Use the input state for saving

    try {
      const currentDocSnap = await getDoc(siteAssetsDocRef);
      const currentData = currentDocSnap.data() || {};

      const dataToSave: { [key: string]: any } = {
        personaTraits,
        useKnowledgeInGreeting,
        customGreetingMessage: customGreetingMessage.trim() === "" ? "" : customGreetingMessage,
        responsePauseTimeMs: validPauseTime,
        publicEmbedUrl: finalPublicEmbedUrl, // Save the current input value
      };

      if (avatarUpdated || newAvatarUrl !== currentData.avatarUrl) {
        dataToSave.avatarUrl = newAvatarUrl;
      }
      if (animatedAvatarUpdated || newAnimatedAvatarUrl !== currentData.animatedAvatarUrl) {
        dataToSave.animatedAvatarUrl = newAnimatedAvatarUrl;
      }
      
      let settingsChanged = false;
      if (Object.keys(dataToSave).some(key => dataToSave[key] !== (currentData[key] ?? (key === 'publicEmbedUrl' ? DEFAULT_PUBLIC_EMBED_URL : undefined) ))) {
        settingsChanged = true;
      }
      // Explicit checks for default values if currentData doesn't have the key
      if (dataToSave.personaTraits !== (currentData.personaTraits || DEFAULT_PERSONA_TRAITS_TEXT)) settingsChanged = true;
      if (dataToSave.useKnowledgeInGreeting !== (currentData.useKnowledgeInGreeting === undefined ? true : currentData.useKnowledgeInGreeting)) settingsChanged = true;
      if (dataToSave.customGreetingMessage !== (currentData.customGreetingMessage || DEFAULT_CUSTOM_GREETING)) settingsChanged = true;
      if (dataToSave.responsePauseTimeMs !== (currentData.responsePauseTimeMs === undefined ? DEFAULT_RESPONSE_PAUSE_TIME_MS : currentData.responsePauseTimeMs)) settingsChanged = true;
      if (dataToSave.publicEmbedUrl !== (currentData.publicEmbedUrl || DEFAULT_PUBLIC_EMBED_URL)) settingsChanged = true;


      if (settingsChanged || avatarUpdated || animatedAvatarUpdated) {
        if (currentDocSnap.exists()) {
          await updateDoc(siteAssetsDocRef, dataToSave);
        } else {
          // Default other fields that might be on site_display_assets from SiteSettingsPage
          await setDoc(siteAssetsDocRef, {
             ...dataToSave,
             avatarUrl: dataToSave.avatarUrl !== undefined ? dataToSave.avatarUrl : DEFAULT_AVATAR_PLACEHOLDER,
             animatedAvatarUrl: dataToSave.animatedAvatarUrl !== undefined ? dataToSave.animatedAvatarUrl : DEFAULT_ANIMATED_AVATAR_PLACEHOLDER,
             splashImageUrl: currentData.splashImageUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
             splashWelcomeMessage: currentData.splashWelcomeMessage || "Welcome to AI Chat",
             enableTextAnimation: currentData.enableTextAnimation === undefined ? false : currentData.enableTextAnimation,
             textAnimationSpeedMs: currentData.textAnimationSpeedMs === undefined ? 800 : currentData.textAnimationSpeedMs,
          });
        }
        setCurrentPublicEmbedUrl(finalPublicEmbedUrl); // Update the display URL after successful save
        const input: AdjustAiPersonaAndPersonalityInput = { personaTraits };
        const result = await adjustAiPersonaAndPersonality(input);
        let toastMessages = ["AI persona and avatar settings have been updated."];
        if (avatarUpdated && newAvatarUrl !== currentData.avatarUrl) toastMessages.unshift("Static avatar updated.");
        if (animatedAvatarUpdated && newAnimatedAvatarUrl !== currentData.animatedAvatarUrl) toastMessages.unshift("Animated avatar updated.");
        if(dataToSave.publicEmbedUrl !== (currentData.publicEmbedUrl || DEFAULT_PUBLIC_EMBED_URL)) toastMessages.unshift("Public URL for embeds updated.");
        
        toast({ title: "Persona Settings Saved", description: result.updatedPersonaDescription + " " + toastMessages.join(" ") });
      } else {
        toast({ title: "No Changes", description: "No settings were changed." });
      }

    } catch (error) {
      console.error("Failed to save persona/avatars or call AI flow:", error);
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

  const generateIframeSnippet = (mode: 'audio-only' | 'audio-text' | 'text-only'): string => {
    const baseUrl = currentPublicEmbedUrl.trim() || (typeof window !== 'undefined' ? window.location.origin : 'YOUR_APP_URL');
    const src = `${baseUrl}/start/${mode}`;
    const allowMic = (mode === 'audio-only' || mode === 'audio-text') ? ' allow="microphone"' : '';
    // Using a common style, can be adjusted later if needed
    const style = "border:1px solid #ccc; border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,0.1); width:400px; height:600px;";
    return `<iframe src="${src}" style="${style}"${allowMic}></iframe>`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied to Clipboard!", description: "Iframe snippet copied." });
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      toast({ title: "Copy Failed", description: "Could not copy snippet. See console.", variant: "destructive" });
    });
  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2"><Bot /> AI Persona & Main Settings</CardTitle>
          <CardDescription>
            Define AI Blair's conversational style, traits, avatars, and other core interaction settings.
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
                />
                <p className="text-xs text-muted-foreground mt-1">This description will be used by the AI to guide its responses.</p>
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
                />
                <p className="text-xs text-muted-foreground mt-1">
                  If you provide a greeting here, it will be used exactly as written, overriding the dynamic greeting generation.
                </p>
              </div>
               <div className="space-y-2">
                <Label htmlFor="responsePauseTime" className="font-medium flex items-center gap-1.5">
                    <Timer className="h-4 w-4" />
                    User Speaking Pause Time (milliseconds)
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
                />
                <p className="text-xs text-muted-foreground mt-1">
                    Pause duration (after user stops speaking) before AI processes input in Audio Only mode. Default: {DEFAULT_RESPONSE_PAUSE_TIME_MS}ms.
                </p>
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
                          unoptimized={true} 
                          onError={() => { console.warn("Custom animated avatar failed to load, falling back."); setAnimatedAvatarPreview(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);}}
                        />
                      <Input type="file" accept="image/gif" ref={animatedAvatarInputRef} onChange={handleAnimatedAvatarChange} className="hidden" id="animated-avatar-upload"/>
                      <Button variant="outline" size="sm" onClick={() => animatedAvatarInputRef.current?.click()}><UploadCloud className="mr-2 h-4 w-4"/>Choose GIF</Button>
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

      <Card>
        <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-code-xml"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>
                Embeddable Chatbot Snippets
            </CardTitle>
            <CardDescription>
                Enter your site&apos;s public production URL below and save it. Then, copy and paste these HTML snippets
                to embed AI Blair on other websites. The chatbot will appear without the header and footer, starting from a dedicated minimal page.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            {isLoadingData ? (<p>Loading embed settings...</p>) : (
            <>
                <div className="space-y-2">
                    <Label htmlFor="publicEmbedUrl" className="font-medium flex items-center gap-1.5"><LinkIcon className="h-4 w-4" /> Public URL for Embeds</Label>
                    <div className="flex items-center gap-2">
                        <Input
                            id="publicEmbedUrl"
                            value={publicEmbedUrlInput}
                            onChange={handlePublicEmbedUrlChange}
                            placeholder="e.g., https://your-app-name.web.app"
                        />
                        <Button onClick={handleSavePublicEmbedUrl} variant="outline" disabled={isSaving}>
                            <Save className="mr-2 h-4 w-4" /> Save URL
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        If left empty after saving, snippets will use the current browser URL (which might be the Studio URL when generating). For production, ensure this is your deployed app URL.
                    </p>
                </div>

                {[
                    { title: "Audio Only Mode", mode: "audio-only" as const },
                    { title: "Audio & Text Mode (Recommended)", mode: "audio-text" as const },
                    { title: "Text Only Mode", mode: "text-only" as const }
                ].map(({ title, mode }) => {
                    const snippet = generateIframeSnippet(mode);
                    return (
                        <div key={mode} className="space-y-2">
                            <Label className="font-medium">{title}</Label>
                            <div className="relative group">
                                <Textarea
                                    value={snippet}
                                    readOnly
                                    rows={5}
                                    className="bg-muted/50 font-mono text-xs pr-10"
                                />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-2 right-2 h-7 w-7 opacity-50 group-hover:opacity-100 transition-opacity"
                                    onClick={() => copyToClipboard(snippet)}
                                    aria-label={`Copy ${title} snippet`}
                                >
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
