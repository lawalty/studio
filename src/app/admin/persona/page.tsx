
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
import { storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

const PERSONA_STORAGE_KEY = "aiBlairPersona";
const AVATAR_STORAGE_KEY = "aiBlairAvatar";
const DEFAULT_AVATAR_PLACEHOLDER = "https://placehold.co/150x150.png?text=Avatar";
const AVATAR_FIREBASE_PATH = "site_assets/avatar_image"; // Fixed path

export default function PersonaPage() {
  const [personaTraits, setPersonaTraits] = useState(""); // Initialize empty, load from localStorage
  const [avatarPreview, setAvatarPreview] = useState<string>(DEFAULT_AVATAR_PLACEHOLDER);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const DEFAULT_PERSONA_TRAITS_TEXT = "You are AI Blair, a knowledgeable and helpful assistant specializing in the pawn store industry. You are professional, articulate, and provide clear, concise answers based on your knowledge base. Your tone is engaging and conversational.";


  useEffect(() => {
    const storedPersona = localStorage.getItem(PERSONA_STORAGE_KEY);
    setPersonaTraits(storedPersona || DEFAULT_PERSONA_TRAITS_TEXT);

    const storedAvatarUrl = localStorage.getItem(AVATAR_STORAGE_KEY);
    setAvatarPreview(storedAvatarUrl || DEFAULT_AVATAR_PLACEHOLDER);
  }, [DEFAULT_PERSONA_TRAITS_TEXT]);

  const handlePersonaChange = (e: React.ChangeEvent<Textarea>) => {
    setPersonaTraits(e.target.value);
  };

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedAvatarFile(file); // Store the file object
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string); // Show local data URI preview
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    // Save Persona Traits
    localStorage.setItem(PERSONA_STORAGE_KEY, personaTraits);
    try {
      const input: AdjustAiPersonaAndPersonalityInput = { personaTraits };
      const result = await adjustAiPersonaAndPersonality(input);
      toast({ title: "Persona Traits Saved", description: result.updatedPersonaDescription || "AI persona traits have been updated." });
    } catch (error) {
      console.error("Failed to adjust persona via AI flow:", error);
      toast({ title: "Persona Traits Saved (Locally)", description: "AI persona traits saved locally. AI flow adjustment failed.", variant: "default" });
    }

    // Handle Avatar Image
    if (selectedAvatarFile) {
      const fileRef = storageRef(storage, AVATAR_FIREBASE_PATH);
      try {
        await uploadBytes(fileRef, selectedAvatarFile);
        const downloadURL = await getDownloadURL(fileRef);
        localStorage.setItem(AVATAR_STORAGE_KEY, downloadURL);
        setAvatarPreview(downloadURL);
        setSelectedAvatarFile(null);
        toast({ title: "Avatar Uploaded", description: "New avatar image has been saved." });
      } catch (uploadError) {
        console.error("Avatar upload error:", uploadError);
        toast({ title: "Avatar Upload Failed", description: "Could not upload new avatar image. Please try again.", variant: "destructive" });
      }
    } else if (avatarPreview === DEFAULT_AVATAR_PLACEHOLDER && localStorage.getItem(AVATAR_STORAGE_KEY)) {
      // If preview is the placeholder AND a custom avatar was stored, it means user wants to reset
      localStorage.removeItem(AVATAR_STORAGE_KEY);
      // Optionally, delete from Firebase Storage if a fixed path was used and no longer needed by other users
      // For simplicity, we'll just remove from LS. New upload will overwrite.
      // const fileRef = storageRef(storage, AVATAR_FIREBASE_PATH);
      // try { await deleteObject(fileRef); } catch (e) { console.warn("Could not delete old avatar from storage, or it didn't exist", e); }
      toast({ title: "Avatar Reset", description: "Avatar has been reset to the default placeholder." });
    }
    // If no new file selected and preview is not placeholder, it's an existing (likely Firebase) URL. No action needed.

    setIsSaving(false);
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
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Saving...' : 'Save Persona & Avatar'}
          </Button>
        </CardFooter>
      </Card>

      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle className="font-headline">Avatar Image</CardTitle>
          <CardDescription>Upload the image for AI Blair's talking head. Optimal: Square (e.g., 300x300px).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          {avatarPreview && (
            <Image
              src={avatarPreview}
              alt="AI Blair Avatar Preview"
              width={150}
              height={150}
              className="rounded-full border-2 border-primary shadow-md object-cover"
              // data-ai-hint only makes sense for placeholders, not custom uploads
              data-ai-hint={avatarPreview === DEFAULT_AVATAR_PLACEHOLDER ? "professional woman" : undefined}
              unoptimized={avatarPreview.startsWith('data:image/')} // For local data URIs during selection
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
          <Button variant="outline" onClick={() => avatarInputRef.current?.click()}>
            <UploadCloud className="mr-2 h-4 w-4" /> Choose Image
          </Button>
           {selectedAvatarFile && <p className="text-xs text-muted-foreground">New: {selectedAvatarFile.name}</p>}
           <Button variant="link" size="sm" onClick={() => {
             setAvatarPreview(DEFAULT_AVATAR_PLACEHOLDER);
             setSelectedAvatarFile(null); // Clear any selected file if resetting
           }} className="text-xs">Reset to default</Button>
        </CardContent>
      </Card>
    </div>
  );
}
