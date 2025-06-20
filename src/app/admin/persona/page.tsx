
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
const DEFAULT_ANIMATED_AVATAR_PLACEHOLDER = "https://placehold.co/150x150.png?text=GIF";
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
          // If doc doesn't exist, set all to defaults
          setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);
          setAnimatedAvatarPreview(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);
          setPersonaTraits(DEFAULT_PERSONA_TRAITS_TEXT);
          setUseKnowledgeInGreeting(true);
          setCustomGreetingMessage(DEFAULT_CUSTOM_GREETING);
          setResponsePauseTime(String(DEFAULT_RESPONSE_PAUSE_TIME_MS));
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
    const value = e.target.value;
    if (value === '' || /^\d*$/.test(value)) { // Allow empty or only digits
      setResponsePauseTime(value);
    }
  };


  const handleSaveAllSettings = async () => {
    setIsSaving(true);

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
       // If preview is placeholder, ensure we save the placeholder or an empty string if that's desired
       // For now, let's ensure it's the actual placeholder URL if it was reset to it.
       newAvatarUrl = DEFAULT_AVATAR_PLACEHOLDER;
       avatarUpdated = true; // Consider it "updated" if it was reset to default
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
       animatedAvatarUpdated = true; // Consider it "updated" if it was reset to default
    }


    const pauseTimeMs = parseInt(responsePauseTime);
    const validPauseTime = isNaN(pauseTimeMs) || pauseTimeMs < 0 ? DEFAULT_RESPONSE_PAUSE_TIME_MS : pauseTimeMs;

    try {
      const currentDocSnap = await getDoc(siteAssetsDocRef);
      const currentData = currentDocSnap.data() || {};

      // Prepare data to save, only including fields that have changed or are new.
      const dataToSave: { [key: string]: any } = {
        // Always include these as they might change from their text fields
        personaTraits,
        useKnowledgeInGreeting,
        customGreetingMessage: customGreetingMessage.trim() === "" ? "" : customGreetingMessage, // Store empty string if cleared
        responsePauseTimeMs: validPauseTime,
      };

      // Only add avatar URLs if they've been updated or are different from stored
      if (avatarUpdated || newAvatarUrl !== currentData.avatarUrl) {
        dataToSave.avatarUrl = newAvatarUrl;
      }
      if (animatedAvatarUpdated || newAnimatedAvatarUrl !== currentData.animatedAvatarUrl) {
        dataToSave.animatedAvatarUrl = newAnimatedAvatarUrl;
      }


      // Determine if any actual settings changed to avoid unnecessary writes/AI calls
      let settingsActuallyChanged = false;
      if (Object.keys(dataToSave).some(key => dataToSave[key] !== (currentData[key] ))) {
        settingsActuallyChanged = true;
      }
      // More explicit checks for defaults might be needed if currentData[key] could be undefined vs. default
      if (dataToSave.personaTraits !== (currentData.personaTraits || DEFAULT_PERSONA_TRAITS_TEXT)) settingsActuallyChanged = true;
      if (dataToSave.useKnowledgeInGreeting !== (currentData.useKnowledgeInGreeting === undefined ? true : currentData.useKnowledgeInGreeting)) settingsActuallyChanged = true;
      if (dataToSave.customGreetingMessage !== (currentData.customGreetingMessage || DEFAULT_CUSTOM_GREETING)) settingsActuallyChanged = true;
      if (dataToSave.responsePauseTimeMs !== (currentData.responsePauseTimeMs === undefined ? DEFAULT_RESPONSE_PAUSE_TIME_MS : currentData.responsePauseTimeMs)) settingsActuallyChanged = true;


      if (settingsActuallyChanged || avatarUpdated || animatedAvatarUpdated) {
        if (currentDocSnap.exists()) {
          // Only update the fields that are part of this page's concerns
          const updatePayload = { ...dataToSave };
          // Ensure we don't accidentally wipe other fields from site_display_assets
          // by explicitly merging only what this page manages.
          await updateDoc(siteAssetsDocRef, updatePayload);
        } else {
          // If document doesn't exist, create it with all fields this page manages + defaults for others
          await setDoc(siteAssetsDocRef, {
             // Fields managed by this page
             ...dataToSave, // This includes personaTraits, avatars, greeting settings, pause time
             avatarUrl: dataToSave.avatarUrl !== undefined ? dataToSave.avatarUrl : DEFAULT_AVATAR_PLACEHOLDER,
             animatedAvatarUrl: dataToSave.animatedAvatarUrl !== undefined ? dataToSave.animatedAvatarUrl : DEFAULT_ANIMATED_AVATAR_PLACEHOLDER,
             // Default values for fields NOT managed by this page but potentially in the same doc
             splashImageUrl: currentData.splashImageUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", // Default transparent GIF
             splashWelcomeMessage: currentData.splashWelcomeMessage || "Welcome to AI Chat",
             enableTextAnimation: currentData.enableTextAnimation === undefined ? false : currentData.enableTextAnimation,
             textAnimationSpeedMs: currentData.textAnimationSpeedMs === undefined ? 800 : currentData.textAnimationSpeedMs,
             // Removed Public URL for Embeds as per rollback
          });
        }

        // Call the AI flow to update persona
        const input: AdjustAiPersonaAndPersonalityInput = { personaTraits };
        const result = await adjustAiPersonaAndPersonality(input);

        let toastMessages = ["AI persona and avatar settings have been updated."];
        if (avatarUpdated && newAvatarUrl !== currentData.avatarUrl) toastMessages.unshift("Static avatar updated.");
        if (animatedAvatarUpdated && newAnimatedAvatarUrl !== currentData.animatedAvatarUrl) toastMessages.unshift("Animated avatar updated.");

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
    setSelectedAvatarFile(null); // Clear any selected file
    if (avatarInputRef.current) avatarInputRef.current.value = ""; // Reset file input
    toast({ title: "Static Avatar Preview Reset", description: "Preview reset. Click 'Save All Settings' to make it permanent."});
  };

  const handleResetAnimatedAvatar = async () => {
    setAnimatedAvatarPreview(DEFAULT_ANIMATED_AVATAR_PLACEHOLDER);
    setSelectedAnimatedAvatarFile(null); // Clear any selected file
    if (animatedAvatarInputRef.current) animatedAvatarInputRef.current.value = ""; // Reset file input
    toast({ title: "Animated Avatar Preview Reset", description: "Preview reset. Click 'Save All Settings' to make it permanent."});
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
                    type="number" // Changed to number for better input control, though state is string
                    value={responsePauseTime}
                    onChange={handleResponsePauseTimeChange}
                    placeholder="e.g., 750"
                    min="0" // Min value for number input
                    step="50" // Step for number input
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
                          // Key for re-rendering if src changes between data URI and placeholder
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
                          unoptimized={true} // GIFs are always unoptimized with next/image
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
              {/* Removed Public URL for Embeds section */}
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
