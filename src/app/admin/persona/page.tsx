
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
import { Save, UploadCloud, Bot, MessageSquareText, Type, Timer, Film } from 'lucide-react';
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

export default function PersonaPage() {
  const [personaTraits, setPersonaTraits] = useState(DEFAULT_PERSONA_TRAITS_TEXT);
  const [avatarPreview, setAvatarPreview] = useState<string>(DEFAULT_AVATAR_PLACEHOLDER);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [animatedAvatarPreview, setAnimatedAvatarPreview] = useState<string>(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);
  const [selectedAnimatedAvatarFile, setSelectedAnimatedAvatarFile] = useState<File | null>(null);
  const [useKnowledgeInGreeting, setUseKnowledgeInGreeting] = useState<boolean>(true);
  const [customGreetingMessage, setCustomGreetingMessage] = useState<string>(DEFAULT_CUSTOM_GREETING);
  const [responsePauseTime, setResponsePauseTime] = useState<string>(String(DEFAULT_RESPONSE_PAUSE_TIME_MS));
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
        } else {
          setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);
          setAnimatedAvatarPreview(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);
          setPersonaTraits(DEFAULT_PERSONA_TRAITS_TEXT);
          setUseKnowledgeInGreeting(true);
          setCustomGreetingMessage(DEFAULT_CUSTOM_GREETING);
          setResponsePauseTime(String(DEFAULT_RESPONSE_PAUSE_TIME_MS));
        }
      } catch (error) {
        console.error("Error fetching site assets from Firestore:", error);
        setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);
        setAnimatedAvatarPreview(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);
        setPersonaTraits(DEFAULT_PERSONA_TRAITS_TEXT);
        setUseKnowledgeInGreeting(true);
        setCustomGreetingMessage(DEFAULT_CUSTOM_GREETING);
        setResponsePauseTime(String(DEFAULT_RESPONSE_PAUSE_TIME_MS));
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


  const handleSave = async () => {
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
        setAvatarPreview(newAvatarUrl); // Update preview with final URL
        setSelectedAvatarFile(null);
        avatarUpdated = true;
        toast({ title: "Static Avatar Uploaded", description: "New static avatar image has been saved." });
      } catch (uploadError: any) {
        toast({ title: "Static Avatar Upload Failed", description: `Could not upload: ${uploadError.message}`, variant: "destructive" });
        setIsSaving(false); return;
      }
    } else if (avatarPreview === DEFAULT_AVATAR_PLACEHOLDER) {
       newAvatarUrl = DEFAULT_AVATAR_PLACEHOLDER; // Ensure default is saved if reset
       avatarUpdated = true; // Mark as updated if it was reset to default
    }


    if (selectedAnimatedAvatarFile) {
      const animatedFileRef = storageRef(storage, ANIMATED_AVATAR_FIREBASE_STORAGE_PATH);
      try {
        await uploadBytes(animatedFileRef, selectedAnimatedAvatarFile);
        newAnimatedAvatarUrl = await getDownloadURL(animatedFileRef);
        setAnimatedAvatarPreview(newAnimatedAvatarUrl); // Update preview with final URL
        setSelectedAnimatedAvatarFile(null);
        animatedAvatarUpdated = true;
        toast({ title: "Animated Avatar Uploaded", description: "New animated GIF avatar has been saved." });
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

    try {
      const currentDocSnap = await getDoc(siteAssetsDocRef);
      const currentData = currentDocSnap.data() || {};

      const dataToSave: { [key: string]: any } = {
        personaTraits,
        useKnowledgeInGreeting,
        customGreetingMessage: customGreetingMessage.trim() === "" ? "" : customGreetingMessage,
        responsePauseTimeMs: validPauseTime,
      };

      if (avatarUpdated || newAvatarUrl !== currentData.avatarUrl) {
        dataToSave.avatarUrl = newAvatarUrl;
      }
      if (animatedAvatarUpdated || newAnimatedAvatarUrl !== currentData.animatedAvatarUrl) {
        dataToSave.animatedAvatarUrl = newAnimatedAvatarUrl;
      }
      

      if (Object.keys(dataToSave).length > 4 || dataToSave.personaTraits !== (currentData.personaTraits || DEFAULT_PERSONA_TRAITS_TEXT) || dataToSave.useKnowledgeInGreeting !== (currentData.useKnowledgeInGreeting === undefined ? true : currentData.useKnowledgeInGreeting) || dataToSave.customGreetingMessage !== (currentData.customGreetingMessage || DEFAULT_CUSTOM_GREETING) || dataToSave.responsePauseTimeMs !== (currentData.responsePauseTimeMs === undefined ? DEFAULT_RESPONSE_PAUSE_TIME_MS : currentData.responsePauseTimeMs) ) {
        if (currentDocSnap.exists()) {
          await updateDoc(siteAssetsDocRef, dataToSave);
        } else {
          await setDoc(siteAssetsDocRef, {
             ...dataToSave,
             // ensure all fields are present on new doc creation
             avatarUrl: dataToSave.avatarUrl !== undefined ? dataToSave.avatarUrl : DEFAULT_AVATAR_PLACEHOLDER,
             animatedAvatarUrl: dataToSave.animatedAvatarUrl !== undefined ? dataToSave.animatedAvatarUrl : DEFAULT_ANIMATED_AVATAR_PLACEHOLDER,
             splashImageUrl: currentData.splashImageUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
             splashWelcomeMessage: currentData.splashWelcomeMessage || "Welcome to AI Chat",
             enableTextAnimation: currentData.enableTextAnimation === undefined ? false : currentData.enableTextAnimation,
             textAnimationSpeedMs: currentData.textAnimationSpeedMs === undefined ? 800 : currentData.textAnimationSpeedMs,

          });
        }
        const input: AdjustAiPersonaAndPersonalityInput = { personaTraits };
        const result = await adjustAiPersonaAndPersonality(input);
        toast({ title: "Persona Settings Saved", description: result.updatedPersonaDescription || "AI persona and avatar settings have been updated." });
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
    toast({ title: "Static Avatar Preview Reset", description: "Preview reset. Click 'Save Settings' to make it permanent."});
  };

  const handleResetAnimatedAvatar = async () => {
    setAnimatedAvatarPreview(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);
    setSelectedAnimatedAvatarFile(null);
    if (animatedAvatarInputRef.current) animatedAvatarInputRef.current.value = "";
    toast({ title: "Animated Avatar Preview Reset", description: "Preview reset. Click 'Save Settings' to make it permanent."});
  };


  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2"><Bot /> AI Persona & Personality</CardTitle>
          <CardDescription>
            Define AI Blair's conversational style, traits, and attributes. This shapes how the AI interacts with visitors.
            Settings are saved in Firestore.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingData ? (<p>Loading persona settings...</p>) : (
            <>
              <div>
                <Label htmlFor="personaTraits" className="font-medium">Persona Traits Description</Label>
                <Textarea
                  id="personaTraits"
                  value={personaTraits}
                  onChange={handlePersonaChange}
                  placeholder="Describe AI Blair's personality, tone, knowledge areas, etc."
                  rows={10}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">This description will be used by the AI to guide its responses.</p>
              </div>
              <div className="flex items-center space-x-3 rounded-md border p-3 shadow-sm mt-4">
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
              <div className="space-y-2 mt-4">
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
                  Otherwise, a greeting will be generated based on the "Tailor Initial Greeting" toggle.
                </p>
              </div>
               <div className="space-y-2 mt-4">
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
            </>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={isSaving || isLoadingData}>
            <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Saving...' : (isLoadingData ? 'Loading...' : 'Save Settings')}
          </Button>
        </CardFooter>
      </Card>

      <div className="md:col-span-1 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Static Avatar Image</CardTitle>
            <CardDescription>
              Default image for AI Blair. Optimal: Square (e.g., 300x300px).
              Stored in Firebase Storage.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-4">
            {isLoadingData ? (
              <div className="w-[150px] h-[150px] bg-muted rounded-full flex items-center justify-center">
                <p className="text-xs text-muted-foreground">Loading...</p>
              </div>
            ) : (
              <Image
                src={avatarPreview}
                alt="AI Blair Static Avatar Preview"
                width={150}
                height={150}
                className="rounded-full border-2 border-primary shadow-md object-cover"
                data-ai-hint={avatarPreview === DEFAULT_AVATAR_PLACEHOLDER || avatarPreview.includes("placehold.co") ? "professional woman" : undefined}
                unoptimized={avatarPreview.startsWith('data:image/') || avatarPreview.startsWith('blob:') || !avatarPreview.startsWith('https://')}
                onError={() => { console.warn("Custom static avatar failed to load, falling back."); setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);}}
              />
            )}
            <Input
              type="file"
              accept="image/png, image/jpeg, image/webp"
              ref={avatarInputRef}
              onChange={handleAvatarChange}
              className="hidden"
              id="avatar-upload"
            />
            <Button variant="outline" onClick={() => avatarInputRef.current?.click()} disabled={isLoadingData}>
              <UploadCloud className="mr-2 h-4 w-4" /> Choose Image
            </Button>
            {selectedAvatarFile && <p className="text-xs text-muted-foreground">New: {selectedAvatarFile.name}</p>}
            <Button variant="link" size="sm" onClick={handleResetAvatar} className="text-xs" disabled={isLoadingData}>Reset to default</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><Film /> Animated Speaking Avatar (GIF)</CardTitle>
            <CardDescription>
              Upload an animated GIF for when AI Blair is speaking.
              Will play in audio modes. Stored in Firebase Storage.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-4">
            {isLoadingData ? (
              <div className="w-[150px] h-[150px] bg-muted rounded-full flex items-center justify-center">
                <p className="text-xs text-muted-foreground">Loading...</p>
              </div>
            ) : (
              <Image
                src={animatedAvatarPreview}
                alt="AI Blair Animated Avatar Preview"
                width={150}
                height={150}
                className="rounded-full border-2 border-accent shadow-md object-cover"
                data-ai-hint={animatedAvatarPreview === DEFAULT_ANIMATED_AVATAR_PLACEHOLDER || animatedAvatarPreview.includes("placehold.co") ? "animated face" : undefined}
                unoptimized={true} // GIFs must be unoptimized to animate
                onError={() => { console.warn("Custom animated avatar failed to load, falling back."); setAnimatedAvatarPreview(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);}}
              />
            )}
            <Input
              type="file"
              accept="image/gif"
              ref={animatedAvatarInputRef}
              onChange={handleAnimatedAvatarChange}
              className="hidden"
              id="animated-avatar-upload"
            />
            <Button variant="outline" onClick={() => animatedAvatarInputRef.current?.click()} disabled={isLoadingData}>
              <UploadCloud className="mr-2 h-4 w-4" /> Choose GIF
            </Button>
            {selectedAnimatedAvatarFile && <p className="text-xs text-muted-foreground">New: {selectedAnimatedAvatarFile.name}</p>}
            <Button variant="link" size="sm" onClick={handleResetAnimatedAvatar} className="text-xs" disabled={isLoadingData}>Reset to default</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
    

    

