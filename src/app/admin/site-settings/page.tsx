
'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from "@/hooks/use-toast";
import { Save, UploadCloud, Image as ImageIcon, MessageSquare, RotateCcw, Film, Zap } from 'lucide-react';
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const DEFAULT_SPLASH_IMAGE_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"; // Transparent 1x1 GIF
const SPLASH_IMAGE_FIREBASE_STORAGE_PATH = "site_assets/splash_image";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const DEFAULT_SPLASH_WELCOME_MESSAGE = "Welcome to AI Chat";
const DEFAULT_ENABLE_TEXT_ANIMATION = false;
const DEFAULT_TEXT_ANIMATION_SPEED_MS = 800;

export default function SiteSettingsPage() {
  const [splashImagePreview, setSplashImagePreview] = useState<string>(DEFAULT_SPLASH_IMAGE_SRC);
  const [selectedSplashFile, setSelectedSplashFile] = useState<File | null>(null);
  const [splashWelcomeMessage, setSplashWelcomeMessage] = useState<string>(DEFAULT_SPLASH_WELCOME_MESSAGE);
  const [enableTextAnimation, setEnableTextAnimation] = useState<boolean>(DEFAULT_ENABLE_TEXT_ANIMATION);
  const [textAnimationSpeedMs, setTextAnimationSpeedMs] = useState<string>(String(DEFAULT_TEXT_ANIMATION_SPEED_MS));

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const splashImageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchSiteAssets = async () => {
      setIsLoadingData(true);
      try {
        const docRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSplashImagePreview(data.splashImageUrl || DEFAULT_SPLASH_IMAGE_SRC);
          setSplashWelcomeMessage(data.splashWelcomeMessage || DEFAULT_SPLASH_WELCOME_MESSAGE);
          setEnableTextAnimation(typeof data.enableTextAnimation === 'boolean' ? data.enableTextAnimation : DEFAULT_ENABLE_TEXT_ANIMATION);
          setTextAnimationSpeedMs(data.textAnimationSpeedMs === undefined ? String(DEFAULT_TEXT_ANIMATION_SPEED_MS) : String(data.textAnimationSpeedMs));
        } else {
          setSplashImagePreview(DEFAULT_SPLASH_IMAGE_SRC);
          setSplashWelcomeMessage(DEFAULT_SPLASH_WELCOME_MESSAGE);
          setEnableTextAnimation(DEFAULT_ENABLE_TEXT_ANIMATION);
          setTextAnimationSpeedMs(String(DEFAULT_TEXT_ANIMATION_SPEED_MS));
        }
      } catch (error) {
        console.error("Error fetching site assets from Firestore:", error);
        setSplashImagePreview(DEFAULT_SPLASH_IMAGE_SRC);
        setSplashWelcomeMessage(DEFAULT_SPLASH_WELCOME_MESSAGE);
        setEnableTextAnimation(DEFAULT_ENABLE_TEXT_ANIMATION);
        setTextAnimationSpeedMs(String(DEFAULT_TEXT_ANIMATION_SPEED_MS));
        toast({
          title: "Error Loading Settings",
          description: "Could not fetch site settings from the database. Using defaults.",
          variant: "destructive",
        });
      }
      setIsLoadingData(false);
    };
    fetchSiteAssets();
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

  const handleSplashWelcomeMessageChange = (event: React.ChangeEvent<Textarea>) => {
    setSplashWelcomeMessage(event.target.value);
  };

  const handleTextAnimationSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*$/.test(value)) {
      setTextAnimationSpeedMs(value);
    }
  };

  const handleSaveAllSiteSettings = async () => {
    setIsSaving(true);
    const siteAssetsDocRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
    let newSplashImageUrl = splashImagePreview;
    let imageUpdated = false;

    if (selectedSplashFile) {
      const fileRef = storageRef(storage, SPLASH_IMAGE_FIREBASE_STORAGE_PATH);
      try {
        await uploadBytes(fileRef, selectedSplashFile);
        newSplashImageUrl = await getDownloadURL(fileRef);
        imageUpdated = true;
      } catch (uploadError: any) {
        console.error("Splash image upload error:", uploadError);
        toast({ title: "Image Upload Error", description: `Could not upload new splash image: ${uploadError.message || 'Unknown error'}. Settings not saved.`, variant: "destructive" });
        setIsSaving(false);
        return;
      }
    }

    const speedMs = parseInt(textAnimationSpeedMs, 10);
    const validAnimationSpeed = isNaN(speedMs) || speedMs <= 0 ? DEFAULT_TEXT_ANIMATION_SPEED_MS : speedMs;


    try {
      const dataToSave: { 
        splashImageUrl?: string; 
        splashWelcomeMessage?: string;
        enableTextAnimation?: boolean;
        textAnimationSpeedMs?: number;
      } = {};
      const currentDocSnap = await getDoc(siteAssetsDocRef);
      const currentData = currentDocSnap.data() || {};

      let changesMade = false;

      if (imageUpdated || newSplashImageUrl !== currentData.splashImageUrl) {
        dataToSave.splashImageUrl = newSplashImageUrl;
        changesMade = true;
      } else if (!newSplashImageUrl && currentData.splashImageUrl !== DEFAULT_SPLASH_IMAGE_SRC) {
        // This condition handles resetting to default if the preview is the default transparent GIF
        // and the stored URL is something else.
        // It also ensures that if the preview is the default, and it matches what's in DB (or DB is empty for this field),
        // we don't unnecessarily write the default.
        if (splashImagePreview === DEFAULT_SPLASH_IMAGE_SRC && (currentData.splashImageUrl && currentData.splashImageUrl !== DEFAULT_SPLASH_IMAGE_SRC)){
            dataToSave.splashImageUrl = DEFAULT_SPLASH_IMAGE_SRC;
            changesMade = true;
        }
      }


      if (splashWelcomeMessage !== (currentData.splashWelcomeMessage || DEFAULT_SPLASH_WELCOME_MESSAGE)) {
        dataToSave.splashWelcomeMessage = splashWelcomeMessage;
        changesMade = true;
      }

      if (enableTextAnimation !== (currentData.enableTextAnimation === undefined ? DEFAULT_ENABLE_TEXT_ANIMATION : currentData.enableTextAnimation)) {
        dataToSave.enableTextAnimation = enableTextAnimation;
        changesMade = true;
      }

      if (validAnimationSpeed !== (currentData.textAnimationSpeedMs === undefined ? DEFAULT_TEXT_ANIMATION_SPEED_MS : currentData.textAnimationSpeedMs)) {
        dataToSave.textAnimationSpeedMs = validAnimationSpeed;
        changesMade = true;
      }


      if (changesMade) {
        if (currentDocSnap.exists()) {
          await updateDoc(siteAssetsDocRef, dataToSave);
        } else {
          // Ensure all necessary fields are present for a new document creation
          const fullDataForNewDoc = {
            splashImageUrl: dataToSave.splashImageUrl !== undefined ? dataToSave.splashImageUrl : (currentData.splashImageUrl || DEFAULT_SPLASH_IMAGE_SRC),
            splashWelcomeMessage: dataToSave.splashWelcomeMessage !== undefined ? dataToSave.splashWelcomeMessage : (currentData.splashWelcomeMessage || DEFAULT_SPLASH_WELCOME_MESSAGE),
            enableTextAnimation: dataToSave.enableTextAnimation !== undefined ? dataToSave.enableTextAnimation : (currentData.enableTextAnimation === undefined ? DEFAULT_ENABLE_TEXT_ANIMATION : currentData.enableTextAnimation),
            textAnimationSpeedMs: dataToSave.textAnimationSpeedMs !== undefined ? dataToSave.textAnimationSpeedMs : (currentData.textAnimationSpeedMs === undefined ? DEFAULT_TEXT_ANIMATION_SPEED_MS : currentData.textAnimationSpeedMs),
            // Preserve other existing fields if any, like avatarUrl, personaTraits etc.
            ...(currentData.avatarUrl && { avatarUrl: currentData.avatarUrl }),
            ...(currentData.personaTraits && { personaTraits: currentData.personaTraits }),
            ...(currentData.useKnowledgeInGreeting !== undefined && { useKnowledgeInGreeting: currentData.useKnowledgeInGreeting }),
            ...(currentData.customGreetingMessage && { customGreetingMessage: currentData.customGreetingMessage }),
            ...(currentData.responsePauseTimeMs !== undefined && { responsePauseTimeMs: currentData.responsePauseTimeMs }),
          };
          await setDoc(siteAssetsDocRef, fullDataForNewDoc);
        }
        toast({ title: "Site Settings Saved", description: "Your site display and animation settings have been updated in Firebase." });
        if (imageUpdated) {
          setSplashImagePreview(newSplashImageUrl); 
          setSelectedSplashFile(null);
        } else if (dataToSave.splashImageUrl === DEFAULT_SPLASH_IMAGE_SRC) {
          setSplashImagePreview(DEFAULT_SPLASH_IMAGE_SRC);
        }
      } else {
        toast({ title: "No Changes", description: "No changes detected to save." });
      }
    } catch (error) {
      console.error("Error saving site settings to Firestore:", error);
      toast({ title: "Save Error", description: "Could not save site settings to Firebase.", variant: "destructive" });
    }
    setIsSaving(false);
  };

  const handleResetSplashImage = () => {
    setSplashImagePreview(DEFAULT_SPLASH_IMAGE_SRC);
    setSelectedSplashFile(null);
    toast({ title: "Splash Image Preview Reset", description: "Preview reset. Click 'Save Site Settings' to make it permanent."});
  };

  const handleResetSplashWelcomeMessage = () => {
    setSplashWelcomeMessage(DEFAULT_SPLASH_WELCOME_MESSAGE);
    toast({ title: "Welcome Message Reset", description: "Message reset to default. Click 'Save Site Settings' to make it permanent."});
  };

  const handleResetAnimationSettings = () => {
    setEnableTextAnimation(DEFAULT_ENABLE_TEXT_ANIMATION);
    setTextAnimationSpeedMs(String(DEFAULT_TEXT_ANIMATION_SPEED_MS));
    toast({ title: "Animation Settings Reset", description: "Animation settings reset to default. Click 'Save Site Settings' to make them permanent."});
  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2"><MessageSquare /> Splash Screen Welcome Message</CardTitle>
          <CardDescription>
            Customize the main welcome message displayed on the application's splash screen.
            This message is stored in Firestore.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingData ? (
            <p>Loading welcome message settings...</p>
          ) : (
            <>
              <Label htmlFor="splashWelcomeMessage" className="font-medium">Welcome Message</Label>
              <Textarea
                id="splashWelcomeMessage"
                value={splashWelcomeMessage}
                onChange={handleSplashWelcomeMessageChange}
                placeholder="Enter your custom welcome message..."
                rows={3}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Default: "{DEFAULT_SPLASH_WELCOME_MESSAGE}"
              </p>
            </>
          )}
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={handleResetSplashWelcomeMessage} disabled={isLoadingData}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset Message to Default
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2"><ImageIcon /> Splash Screen Image</CardTitle>
          <CardDescription>
            Upload the image for the splash screen. Stored in Firebase Storage.
            If uploads fail, check Storage rules for '{SPLASH_IMAGE_FIREBASE_STORAGE_PATH}'.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingData ? (
             <div className="w-full max-w-md h-[200px] bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center mx-auto">
                <p className="text-muted-foreground">Loading image settings...</p>
             </div>
          ) : (
            <div className="flex flex-col items-center space-y-4">
              <Label htmlFor="splash-image-upload" className="font-medium self-start sr-only">Splash Image Preview & Upload</Label>
              <Image
                src={splashImagePreview}
                alt="Splash Screen Preview"
                width={400}
                height={267}
                className="rounded-lg border-2 border-primary shadow-md object-cover"
                data-ai-hint={(splashImagePreview === DEFAULT_SPLASH_IMAGE_SRC || splashImagePreview.includes("placehold.co")) ? "technology abstract welcome" : undefined}
                unoptimized={splashImagePreview.startsWith('data:image/') || splashImagePreview.startsWith('blob:')}
                onError={() => setSplashImagePreview(DEFAULT_SPLASH_IMAGE_SRC)}
              />
              <Input
                type="file"
                accept="image/*"
                ref={splashImageInputRef}
                onChange={handleSplashImageChange}
                className="hidden"
                id="splash-image-upload"
              />
              <Button variant="outline" onClick={() => splashImageInputRef.current?.click()} className="w-full max-w-xs" disabled={isLoadingData}>
                <UploadCloud className="mr-2 h-4 w-4" /> Choose Image
              </Button>
              {selectedSplashFile && <p className="text-xs text-muted-foreground">New: {selectedSplashFile.name}</p>}
              <p className="text-xs text-muted-foreground">Recommended: Image with good visibility for text overlay.</p>
            </div>
          )}
        </CardContent>
        <CardFooter>
           <Button variant="outline" onClick={handleResetSplashImage} disabled={isLoadingData}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reset Image to Default
           </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2"><Film /> AI Speech Text Animation</CardTitle>
          <CardDescription>
            Configure the scale-in text animation effect when AI Blair starts speaking.
            Settings are stored in Firestore.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoadingData ? (
            <p>Loading animation settings...</p>
          ) : (
            <>
              <div className="flex items-center space-x-3 rounded-md border p-4 shadow-sm">
                  <Zap className="h-5 w-5 text-primary" />
                  <div className="flex-1 space-y-1">
                      <Label htmlFor="enableTextAnimation" className="font-medium">
                          Enable Scale-In Text Animation
                      </Label>
                      <p className="text-xs text-muted-foreground">
                          If ON, AI Blair's text will animate in letter by letter.
                      </p>
                  </div>
                  <Switch
                      id="enableTextAnimation"
                      checked={enableTextAnimation}
                      onCheckedChange={setEnableTextAnimation}
                      aria-label="Toggle AI speech text animation"
                  />
              </div>
              <div className="space-y-2">
                <Label htmlFor="textAnimationSpeedMs" className="font-medium">Animation Speed (milliseconds)</Label>
                <Input 
                  id="textAnimationSpeedMs" 
                  type="number" 
                  value={textAnimationSpeedMs} 
                  onChange={handleTextAnimationSpeedChange} 
                  placeholder="e.g., 800"
                  min="100"
                  step="50"
                  disabled={!enableTextAnimation || isLoadingData}
                />
                <p className="text-xs text-muted-foreground">
                  Total duration for the text animation. Default: {DEFAULT_TEXT_ANIMATION_SPEED_MS}ms.
                </p>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter>
           <Button variant="outline" onClick={handleResetAnimationSettings} disabled={isLoadingData}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reset Animation Settings to Default
           </Button>
        </CardFooter>
      </Card>


      <div className="flex justify-start py-4 mt-4 border-t pt-6">
        <Button onClick={handleSaveAllSiteSettings} disabled={isSaving || isLoadingData} size="lg">
          <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Saving Settings...' : (isLoadingData ? 'Loading...' : 'Save Site Settings')}
        </Button>
      </div>
    </div>
  );
}

    