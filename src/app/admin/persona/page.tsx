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

const PERSONA_STORAGE_KEY = "aiBlairPersona";
const AVATAR_STORAGE_KEY = "aiBlairAvatar";

const DEFAULT_PERSONA_TRAITS = "You are AI Blair, a knowledgeable and helpful assistant specializing in the pawn store industry. You are professional, articulate, and provide clear, concise answers based on your knowledge base. Your tone is engaging and conversational.";

export default function PersonaPage() {
  const [personaTraits, setPersonaTraits] = useState(DEFAULT_PERSONA_TRAITS);
  const [avatarPreview, setAvatarPreview] = useState<string | null>("https://placehold.co/150x150.png?text=Avatar");
  const [isSaving, setIsSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const storedPersona = localStorage.getItem(PERSONA_STORAGE_KEY);
    if (storedPersona) {
      setPersonaTraits(storedPersona);
    }
    const storedAvatar = localStorage.getItem(AVATAR_STORAGE_KEY);
    if (storedAvatar) {
      setAvatarPreview(storedAvatar);
    }
  }, []);

  const handlePersonaChange = (e: React.ChangeEvent<Textarea>) => {
    setPersonaTraits(e.target.value);
  };

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
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
    if (avatarPreview && !avatarPreview.startsWith('https://placehold.co')) { // Don't save placeholder as actual avatar
        localStorage.setItem(AVATAR_STORAGE_KEY, avatarPreview);
    }

    try {
      const input: AdjustAiPersonaAndPersonalityInput = { personaTraits };
      const result = await adjustAiPersonaAndPersonality(input);
      toast({ title: "Persona Updated", description: result.updatedPersonaDescription || "AI persona and avatar settings have been saved." });
    } catch (error) {
      console.error("Failed to adjust persona via AI flow:", error);
      toast({ title: "Persona Saved (Locally)", description: "AI persona and avatar settings have been saved locally. AI flow adjustment failed.", variant: "default" });
    }
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
            <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Saving...' : 'Save Persona Settings'}
          </Button>
        </CardFooter>
      </Card>

      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle className="font-headline">Avatar Image</CardTitle>
          <CardDescription>Upload the image for AI Blair's talking head.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          {avatarPreview && (
            <Image
              src={avatarPreview}
              alt="AI Blair Avatar Preview"
              width={150}
              height={150}
              className="rounded-full border-2 border-primary shadow-md object-cover"
              data-ai-hint="professional woman"
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
            <UploadCloud className="mr-2 h-4 w-4" /> Choose Avatar
          </Button>
           <p className="text-xs text-muted-foreground">Recommended: Square image (e.g., 300x300px).</p>
        </CardContent>
         {/* Footer for avatar save could be here or combined with main save */}
      </Card>
    </div>
  );
}
