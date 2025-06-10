
'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { Save, UploadCloud, Image as ImageIcon } from 'lucide-react';
import { storage, db } from '@/lib/firebase'; 
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'; 

const DEFAULT_SPLASH_IMAGE_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"; // Transparent 1x1 GIF
const SPLASH_IMAGE_FIREBASE_STORAGE_PATH = "site_assets/splash_image";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";

export default function SiteSettingsPage() {
  const [splashImagePreview, setSplashImagePreview] = useState<string>(DEFAULT_SPLASH_IMAGE_SRC);
  const [selectedSplashFile, setSelectedSplashFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSplash, setIsLoadingSplash] = useState(true);
  const splashImageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchSplashImageUrl = async () => {
      setIsLoadingSplash(true);
      try {
        const docRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data()?.splashImageUrl) {
          setSplashImagePreview(docSnap.data().splashImageUrl);
        } else {
          setSplashImagePreview(DEFAULT_SPLASH_IMAGE_SRC);
        }
      } catch (error) {
        console.error("Error fetching splash image URL from Firestore:", error);
        setSplashImagePreview(DEFAULT_SPLASH_IMAGE_SRC);
        toast({
          title: "Error Loading Splash Image",
          description: "Could not fetch splash image from the database. Using default.",
          variant: "destructive",
        });
      }
      setIsLoadingSplash(false);
    };
    fetchSplashImageUrl();
  }, [toast]);

  const handleSplashImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedSplashFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSplashImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const siteAssetsDocRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);

    if (selectedSplashFile) {
      const fileRef = storageRef(storage, SPLASH_IMAGE_FIREBASE_STORAGE_PATH);
      try {
        await uploadBytes(fileRef, selectedSplashFile);
        const downloadURL = await getDownloadURL(fileRef);
        await setDoc(siteAssetsDocRef, { splashImageUrl: downloadURL }, { merge: true });
        setSplashImagePreview(downloadURL); 
        setSelectedSplashFile(null);
        toast({ title: "Splash Image Saved", description: "New splash screen image has been uploaded and saved to Firebase." });
      } catch (uploadError: any) {
        console.error("Splash image upload error:", uploadError);
        let description = "Could not upload new splash image. Please try again.";
        if (uploadError.code) {
          description += ` (Error: ${uploadError.code})`;
        }
        toast({ title: "Upload Error", description, variant: "destructive", duration: 7000 });
      }
    } else if (splashImagePreview === DEFAULT_SPLASH_IMAGE_SRC) {
      try {
        const docSnap = await getDoc(siteAssetsDocRef);
        if (docSnap.exists() && docSnap.data()?.splashImageUrl !== DEFAULT_SPLASH_IMAGE_SRC) {
           await updateDoc(siteAssetsDocRef, { splashImageUrl: DEFAULT_SPLASH_IMAGE_SRC });
            toast({ title: "Splash Image Reset", description: "Splash screen image has been reset to default in Firebase." });
        } else if (!docSnap.exists()) {
             await setDoc(siteAssetsDocRef, { splashImageUrl: DEFAULT_SPLASH_IMAGE_SRC }, { merge: true });
             toast({ title: "Splash Image Set to Default", description: "Splash image set to default in Firebase." });
        } else {
           toast({ title: "Settings Checked", description: "Splash image settings reviewed." });
        }
      } catch (error) {
          console.error("Error resetting splash image in Firestore:", error);
          toast({ title: "Splash Image Reset Error", description: "Could not update splash image in Firebase. It's reset locally.", variant: "destructive" });
      }
    } else {
      toast({ title: "Settings Checked", description: "Splash image settings reviewed. No new file selected." });
    }
    setIsSaving(false);
  };
  
  const handleResetSplash = async () => {
    setSplashImagePreview(DEFAULT_SPLASH_IMAGE_SRC);
    setSelectedSplashFile(null);
    toast({ title: "Splash Image Preview Reset", description: "Preview reset to default. Click 'Save Splash Image' to make it permanent."});
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2"><ImageIcon /> Splash Screen Image</CardTitle>
        <CardDescription>
          Upload the image to be displayed on the initial splash screen. Images are stored in Firebase Storage.
          If uploads fail, check Storage security rules for '{SPLASH_IMAGE_FIREBASE_STORAGE_PATH}'.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center space-y-4">
          <Label htmlFor="splash-image-upload" className="font-medium self-start">Splash Image Preview & Upload</Label>
          {isLoadingSplash ? (
             <div className="w-[400px] h-[267px] bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                <p className="text-muted-foreground">Loading...</p>
             </div>
          ) : splashImagePreview ? (
            <Image
              src={splashImagePreview}
              alt="Splash Screen Preview"
              width={400}
              height={267} 
              className="rounded-lg border-2 border-primary shadow-md object-cover"
              data-ai-hint={(splashImagePreview === DEFAULT_SPLASH_IMAGE_SRC || splashImagePreview.includes("placehold.co")) ? "technology abstract welcome" : undefined}
              unoptimized={splashImagePreview.startsWith('data:image/')}
              onError={() => setSplashImagePreview(DEFAULT_SPLASH_IMAGE_SRC)} 
            />
          ) : (
             <div className="w-[400px] h-[267px] bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                <p className="text-muted-foreground">No image selected or available</p>
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
          <Button variant="outline" onClick={() => splashImageInputRef.current?.click()} className="w-full max-w-xs" disabled={isLoadingSplash}>
            <UploadCloud className="mr-2 h-4 w-4" /> Choose Image
          </Button>
          {selectedSplashFile && <p className="text-xs text-muted-foreground">New: {selectedSplashFile.name}</p>}
           <p className="text-xs text-muted-foreground">Recommended: Image with good visibility for text overlay.</p>
           <Button variant="link" size="sm" onClick={handleResetSplash} className="text-xs" disabled={isLoadingSplash}>Reset to default</Button>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={isSaving || isLoadingSplash}>
          <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Saving...' : (isLoadingSplash ? 'Loading Splash...' : 'Save Splash Image')}
        </Button>
      </CardFooter>
    </Card>
  );
}
    

