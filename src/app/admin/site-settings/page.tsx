
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
        setSplashImagePreview(downloadURL); // Update preview to the new Firebase URL
        setSelectedSplashFile(null);
        toast({ title: "Splash Image Saved", description: "New splash screen image has been uploaded and saved." });
      } catch (uploadError) {
        console.error("Splash image upload error:", uploadError);
        toast({ title: "Upload Error", description: "Could not upload new splash image. Please try again.", variant: "destructive" });
      }
    } else if (splashImagePreview === DEFAULT_SPLASH_IMAGE_SRC && localStorage.getItem(SPLASH_IMAGE_STORAGE_KEY)) {
      // If preview is default AND a custom image was stored, remove it
      localStorage.removeItem(SPLASH_IMAGE_STORAGE_KEY);
      // Optionally, delete from Firebase Storage
      // const fileRef = storageRef(storage, SPLASH_IMAGE_FIREBASE_PATH);
      // try { await deleteObject(fileRef); } catch (e) { console.warn("Could not delete old splash image from storage, or it didn't exist", e); }
      toast({ title: "Splash Image Reset", description: "Splash screen image has been reset to default." });
    } else {
      // No new file and preview isn't default, so current (possibly Firebase) URL is fine or nothing was stored.
      // Or, it's a data URI preview that wasn't from a file selection - this case should be rare if UI guides to 'Choose Image' then 'Save'.
      // If splashImagePreview is a data URI (meaning it was set via file picker but not uploaded yet),
      // this path means user clicked save without selecting a new file this session.
      // We don't re-save data URIs to localStorage. Only Firebase URLs or remove the key.
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
              data-ai-hint={splashImagePreview === DEFAULT_SPLASH_IMAGE_SRC ? "technology abstract welcome" : undefined}
              unoptimized={splashImagePreview.startsWith('data:image/')} // For local data URIs during selection
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
             setSelectedSplashFile(null); // Clear any selected file if resetting
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
