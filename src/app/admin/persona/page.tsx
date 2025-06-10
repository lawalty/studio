
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
import { storage, db } from '@/lib/firebase'; // Import db
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'; // Import Firestore functions

const PERSONA_STORAGE_KEY = "aiBlairPersona"; // Stays in localStorage for now as it's tuned by AI
const DEFAULT_AVATAR_PLACEHOLDER = "https://placehold.co/150x150.png";
const AVATAR_FIREBASE_STORAGE_PATH = "site_assets/avatar_image";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";

export default function PersonaPage() {
  const [personaTraits, setPersonaTraits] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string>(DEFAULT_AVATAR_PLACEHOLDER);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingAvatar, setIsLoadingAvatar] = useState(true);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const DEFAULT_PERSONA_TRAITS_TEXT = "You are AI Blair, a knowledgeable and helpful assistant specializing in the pawn store industry. You are professional, articulate, and provide clear, concise answers based on your knowledge base. Your tone is engaging and conversational.";

  useEffect(() => {
    const storedPersona = localStorage.getItem(PERSONA_STORAGE_KEY);
    setPersonaTraits(storedPersona || DEFAULT_PERSONA_TRAITS_TEXT);

    const fetchAvatarUrl = async () => {
      setIsLoadingAvatar(true);
      try {
        const docRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data()?.avatarUrl) {
          setAvatarPreview(docSnap.data().avatarUrl);
        } else {
          setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);
        }
      } catch (error) {
        console.error("Error fetching avatar URL from Firestore:", error);
        setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);
        toast({
          title: "Error Loading Avatar",
          description: "Could not fetch avatar from the database. Using default.",
          variant: "destructive",
        });
      }
      setIsLoadingAvatar(false);
    };
    fetchAvatarUrl();
  }, [DEFAULT_PERSONA_TRAITS_TEXT, toast]);

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

    localStorage.setItem(PERSONA_STORAGE_KEY, personaTraits);
    try {
      const input: AdjustAiPersonaAndPersonalityInput = { personaTraits };
      const result = await adjustAiPersonaAndPersonality(input);
      toast({ title: "Persona Traits Saved", description: result.updatedPersonaDescription || "AI persona traits have been updated." });
    } catch (error) {
      console.error("Failed to adjust persona via AI flow:", error);
      toast({ title: "Persona Traits Saved (Locally)", description: "AI persona traits saved locally. AI flow adjustment failed.", variant: "default" });
    }

    const siteAssetsDocRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);

    if (selectedAvatarFile) {
      const fileRef = storageRef(storage, AVATAR_FIREBASE_STORAGE_PATH);
      try {
        await uploadBytes(fileRef, selectedAvatarFile);
        const downloadURL = await getDownloadURL(fileRef);
        await setDoc(siteAssetsDocRef, { avatarUrl: downloadURL }, { merge: true });
        setAvatarPreview(downloadURL); // Update preview to the new Firebase URL
        setSelectedAvatarFile(null);
        toast({ title: "Avatar Uploaded", description: "New avatar image has been saved to Firebase." });
      } catch (uploadError: any) {
        console.error("Avatar upload error:", uploadError);
        let description = "Could not upload new avatar image. Please try again.";
        if (uploadError.code) {
          description += ` (Error: ${uploadError.code})`;
        }
        toast({ title: "Avatar Upload Failed", description, variant: "destructive", duration: 7000 });
      }
    } else if (avatarPreview === DEFAULT_AVATAR_PLACEHOLDER) {
      // User reset to default, ensure Firestore reflects this
      try {
        const docSnap = await getDoc(siteAssetsDocRef);
        if (docSnap.exists() && docSnap.data()?.avatarUrl !== DEFAULT_AVATAR_PLACEHOLDER) {
           await updateDoc(siteAssetsDocRef, { avatarUrl: DEFAULT_AVATAR_PLACEHOLDER });
           toast({ title: "Avatar Reset", description: "Avatar has been reset to the default placeholder in Firebase." });
        } else if (!docSnap.exists()){
           await setDoc(siteAssetsDocRef, { avatarUrl: DEFAULT_AVATAR_PLACEHOLDER }, { merge: true });
           toast({ title: "Avatar Set to Default", description: "Avatar has been set to the default placeholder in Firebase." });
        }
      } catch (error) {
          console.error("Error resetting avatar in Firestore:", error);
          toast({ title: "Avatar Reset Error", description: "Could not update avatar in Firebase. It's reset locally.", variant: "destructive" });
      }
    }
    
    setIsSaving(false);
  };

  const handleResetAvatar = async () => {
    setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);
    setSelectedAvatarFile(null);
    // No immediate save on reset, will be handled by onSave if user confirms
    toast({ title: "Avatar Preview Reset", description: "Avatar preview reset to default. Click 'Save Persona & Avatar' to make it permanent."});
  };


  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2"><Bot /> AI Persona & Personality</CardTitle>
          <CardDescription>
            Define AI Blair's conversational style, traits, and attributes. This shapes how the AI interacts with visitors.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={isSaving || isLoadingAvatar}>
            <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Saving...' : (isLoadingAvatar ? 'Loading Avatar...' : 'Save Persona & Avatar')}
          </Button>
        </CardFooter>
      </Card>

      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle className="font-headline">Avatar Image</CardTitle>
          <CardDescription>
            Upload the image for AI Blair's talking head. Optimal: Square (e.g., 300x300px).
            Images are stored in Firebase Storage. If uploads fail, check Storage security rules for '{AVATAR_FIREBASE_STORAGE_PATH}'.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          {isLoadingAvatar ? (
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
              unoptimized={avatarPreview.startsWith('data:image/') || !avatarPreview.startsWith('https')}
              onError={() => setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER)} // Fallback on error
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
          <Button variant="outline" onClick={() => avatarInputRef.current?.click()} disabled={isLoadingAvatar}>
            <UploadCloud className="mr-2 h-4 w-4" /> Choose Image
          </Button>
           {selectedAvatarFile && <p className="text-xs text-muted-foreground">New: {selectedAvatarFile.name}</p>}
           <Button variant="link" size="sm" onClick={handleResetAvatar} className="text-xs" disabled={isLoadingAvatar}>Reset to default</Button>
        </CardContent>
      </Card>
    </div>
  );
}
    
