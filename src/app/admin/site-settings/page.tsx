
'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { Save, UploadCloud, Image as ImageIcon } from 'lucide-react';

const SPLASH_IMAGE_STORAGE_KEY = "aiBlairSplashScreenImage";
const DEFAULT_SPLASH_IMAGE_SRC = "https://i.imgur.com/U50t4xR.jpeg";

export default function SiteSettingsPage() {
  const [splashImagePreview, setSplashImagePreview] = useState<string | null>(DEFAULT_SPLASH_IMAGE_SRC);
  const [isSaving, setIsSaving] = useState(false);
  const splashImageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const storedSplashImage = localStorage.getItem(SPLASH_IMAGE_STORAGE_KEY);
    if (storedSplashImage) {
      setSplashImagePreview(storedSplashImage);
    }
  }, []);

  const handleSplashImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setSplashImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    if (splashImagePreview && splashImagePreview !== DEFAULT_SPLASH_IMAGE_SRC) {
      localStorage.setItem(SPLASH_IMAGE_STORAGE_KEY, splashImagePreview);
    } else {
      // If it's the default, or null, remove from storage to use hardcoded default
      localStorage.removeItem(SPLASH_IMAGE_STORAGE_KEY);
      // Optionally reset preview to default if it was cleared
      // if (!splashImagePreview) setSplashImagePreview(DEFAULT_SPLASH_IMAGE_SRC);
    }
    toast({ title: "Site Settings Saved", description: "Splash screen image has been updated." });
    setIsSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2"><ImageIcon /> Splash Screen Image</CardTitle>
        <CardDescription>
          Upload the image to be displayed on the initial splash screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center space-y-4">
          <Label htmlFor="splash-image-upload" className="font-medium self-start">Splash Image Preview & Upload</Label>
          {splashImagePreview && (
            <Image
              src={splashImagePreview}
              alt="Splash Screen Preview"
              width={400}
              height={267} // Aspect ratio of the default image
              className="rounded-lg border-2 border-primary shadow-md object-cover"
              data-ai-hint="technology abstract welcome" // Generic hint for placeholder
            />
          )}
           {!splashImagePreview && ( // Fallback if somehow preview is null
             <div className="w-[400px] h-[267px] bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                <p className="text-muted-foreground">No image selected</p>
             </div>
           )}
          <Input
            type="file"
            accept="image/*"
            ref={splashImageInputRef}
            onChange={handleSplashImageChange}
            className="hidden"
            id="splash-image-upload"
          />
          <Button variant="outline" onClick={() => splashImageInputRef.current?.click()} className="w-full max-w-xs">
            <UploadCloud className="mr-2 h-4 w-4" /> Choose Image
          </Button>
           <p className="text-xs text-muted-foreground">Recommended: Image with good visibility for text overlay.</p>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Saving...' : 'Save Splash Image'}
        </Button>
      </CardFooter>
    </Card>
  );
}
