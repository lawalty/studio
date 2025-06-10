
'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { Save, UploadCloud, Image as ImageIcon } from 'lucide-react';
import { storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

const SPLASH_IMAGE_STORAGE_KEY = "aiBlairSplashScreenImage";
const DEFAULT_SPLASH_IMAGE_SRC = "https://i.imgur.com/U50t4xR.jpeg";
const SPLASH_IMAGE_FIREBASE_PATH = "site_assets/splash_image"; // Fixed path

export default function SiteSettingsPage() {
  const [splashImagePreview, setSplashImagePreview] = useState<string>(DEFAULT_SPLASH_IMAGE_SRC);
  const [selectedSplashFile, setSelectedSplashFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const splashImageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const storedSplashImage = localStorage.getItem(SPLASH_IMAGE_STORAGE_KEY);
    setSplashImagePreview(storedSplashImage || DEFAULT_SPLASH_IMAGE_SRC);
  }, []);

  const handleSplashImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedSplashFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSplashImagePreview(reader.result as string); // Show local data URI preview
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    if (selectedSplashFile) {
      const fileRef = storageRef(storage, SPLASH_IMAGE_FIREBASE_PATH);
      try {
        await uploadBytes(fileRef, selectedSplashFile);
        const downloadURL = await getDownloadURL(fileRef);
        localStorage.setItem(SPLASH_IMAGE_STORAGE_KEY, downloadURL);
        setSplashImagePreview(downloadURL); 
        setSelectedSplashFile(null);
        toast({ title: "Splash Image Saved", description: "New splash screen image has been uploaded and saved." });
      } catch (uploadError: any) {
        console.error("Splash image upload error:", uploadError.code, uploadError.message, uploadError);
        let description = "Could not upload new splash image. Please try again.";
        if (uploadError.code) {
          description += ` (Error: ${uploadError.code})`;
        }
        toast({ title: "Upload Error", description, variant: "destructive", duration: 7000 });
      }
    } else if (splashImagePreview === DEFAULT_SPLASH_IMAGE_SRC && localStorage.getItem(SPLASH_IMAGE_STORAGE_KEY)) {
      localStorage.removeItem(SPLASH_IMAGE_STORAGE_KEY);
      toast({ title: "Splash Image Reset", description: "Splash screen image has been reset to default." });
    } else {
      if (!selectedSplashFile && splashImagePreview && !splashImagePreview.startsWith('https://') && splashImagePreview !== DEFAULT_SPLASH_IMAGE_SRC) {
         toast({ title: "No Change", description: "Choose a new image file to upload or reset to default.", variant: "default"});
      } else if (!selectedSplashFile) {
         toast({ title: "Settings Checked", description: "Splash image settings reviewed." });
      }
    }
    setIsSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2"><ImageIcon /> Splash Screen Image</CardTitle>
        <CardDescription>
          Upload the image to be displayed on the initial splash screen.
          If uploads fail, please check your Firebase Storage security rules for the path '{SPLASH_IMAGE_FIREBASE_PATH}'.
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
              height={267} 
              className="rounded-lg border-2 border-primary shadow-md object-cover"
              data-ai-hint={splashImagePreview.includes("imgur.com") || splashImagePreview.includes("placehold.co") ? "technology abstract welcome" : undefined}
              unoptimized={splashImagePreview.startsWith('data:image/')} 
            />
          )}
           {!splashImagePreview && (
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
          {selectedSplashFile && <p className="text-xs text-muted-foreground">New: {selectedSplashFile.name}</p>}
           <p className="text-xs text-muted-foreground">Recommended: Image with good visibility for text overlay.</p>
           <Button variant="link" size="sm" onClick={() => {
             setSplashImagePreview(DEFAULT_SPLASH_IMAGE_SRC);
             setSelectedSplashFile(null); 
           }} className="text-xs">Reset to default</Button>
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

    