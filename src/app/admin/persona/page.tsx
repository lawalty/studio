
'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from "@/hooks/use-toast";
import { Save, UploadCloud, Bot } from 'lucide-react';
import { adjustAiPersonaAndPersonality, type AdjustAiPersonaAndPersonalityInput } from '@/ai/flows/persona-personality-tuning';
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const DEFAULT_AVATAR_PLACEHOLDER = "https://placehold.co/150x150.png";
const AVATAR_FIREBASE_STORAGE_PATH = "site_assets/avatar_image";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const DEFAULT_PERSONA_TRAITS_TEXT = "You are AI Blair, a knowledgeable and helpful assistant specializing in the pawn store industry. You are professional, articulate, and provide clear, concise answers based on your knowledge base. Your tone is engaging and conversational.";

export default function PersonaPage() {
  const [personaTraits, setPersonaTraits] = useState(DEFAULT_PERSONA_TRAITS_TEXT);
  const [avatarPreview, setAvatarPreview] = useState<string>(DEFAULT_AVATAR_PLACEHOLDER);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const avatarInputRef = useRef<HTMLInputElement>(null);
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
          setPersonaTraits(data?.personaTraits || DEFAULT_PERSONA_TRAITS_TEXT);
        } else {
          setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);
          setPersonaTraits(DEFAULT_PERSONA_TRAITS_TEXT);
        }
      } catch (error) {
        console.error("Error fetching site assets from Firestore:", error);
        setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);
        setPersonaTraits(DEFAULT_PERSONA_TRAITS_TEXT);
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

  const handleSave = async () => {
    setIsSaving(true);

    const siteAssetsDocRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
    let newAvatarUrl = avatarPreview;
    let avatarUpdated = false;

    if (selectedAvatarFile) {
      const fileRef = storageRef(storage, AVATAR_FIREBASE_STORAGE_PATH);
      try {
        await uploadBytes(fileRef, selectedAvatarFile);
        newAvatarUrl = await getDownloadURL(fileRef);
        setAvatarPreview(newAvatarUrl); 
        setSelectedAvatarFile(null);
        avatarUpdated = true;
        toast({ title: "Avatar Uploaded", description: "New avatar image has been saved." });
      } catch (uploadError: any) {
        console.error("Avatar upload error:", uploadError);
        let description = "Could not upload new avatar image. Please try again.";
        if (uploadError.code) {
          description += ` (Error: ${uploadError.code})`;
        }
        toast({ title: "Avatar Upload Failed", description, variant: "destructive", duration: 7000 });
        setIsSaving(false);
        return; 
      }
    } else if (avatarPreview === DEFAULT_AVATAR_PLACEHOLDER) {
       newAvatarUrl = DEFAULT_AVATAR_PLACEHOLDER;
       avatarUpdated = true; 
    }


    try {
      // Save persona traits and avatar URL to Firestore
      const dataToSave: { personaTraits: string; avatarUrl?: string } = { personaTraits };
      if (avatarUpdated || newAvatarUrl !== (await getDoc(siteAssetsDocRef).then(s => s.data()?.avatarUrl))) {
        dataToSave.avatarUrl = newAvatarUrl;
      }
      
      // Check if document exists to decide between set with merge or update
      const docSnap = await getDoc(siteAssetsDocRef);
      if (docSnap.exists()) {
        await updateDoc(siteAssetsDocRef, dataToSave);
      } else {
        await setDoc(siteAssetsDocRef, dataToSave);
      }

      // Call Genkit flow for persona adjustment
      const input: AdjustAiPersonaAndPersonalityInput = { personaTraits };
      const result = await adjustAiPersonaAndPersonality(input);
      toast({ title: "Persona & Avatar Saved", description: result.updatedPersonaDescription || "AI persona settings have been updated." });

    } catch (error) {
      console.error("Failed to save persona or call AI flow:", error);
      toast({ title: "Error Saving Settings", description: "Could not save all settings. Please check console.", variant: "destructive" });
    }
    
    setIsSaving(false);
  };

  const handleResetAvatar = async () => {
    setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);
    setSelectedAvatarFile(null);
    toast({ title: "Avatar Preview Reset", description: "Avatar preview reset to default. Click 'Save Persona & Avatar' to make it permanent."});
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
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={isSaving || isLoadingData}>
            <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Saving...' : (isLoadingData ? 'Loading...' : 'Save Persona & Avatar')}
          </Button>
        </CardFooter>
      </Card>

      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle className="font-headline">Avatar Image</CardTitle>
          <CardDescription>
            Upload the image for AI Blair's talking head. Optimal: Square (e.g., 300x300px).
            Stored in Firebase Storage. If uploads fail, check Storage rules for '{AVATAR_FIREBASE_STORAGE_PATH}'.
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
              alt="AI Blair Avatar Preview"
              width={150}
              height={150}
              className="rounded-full border-2 border-primary shadow-md object-cover"
              data-ai-hint={avatarPreview === DEFAULT_AVATAR_PLACEHOLDER || avatarPreview.includes("placehold.co") ? "professional woman" : undefined}
              unoptimized={avatarPreview.startsWith('data:image/') || avatarPreview.startsWith('blob:') || !avatarPreview.startsWith('https')}
              onError={() => { console.warn("Custom avatar failed to load, falling back."); setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);}}
            />
          )}
          <Input
            type="file"
            accept="image/*"
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
    </div>
  );
}
    
