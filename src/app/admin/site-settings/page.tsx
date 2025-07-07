
'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { Save, UploadCloud, Image as ImageIcon, MessageSquare, RotateCcw, Clock, Type, Construction, Globe, Monitor } from 'lucide-react';
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Switch } from '@/components/ui/switch';

const DEFAULT_SPLASH_IMAGE_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"; // Transparent 1x1 GIF
const DEFAULT_BACKGROUND_IMAGE_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const SPLASH_IMAGE_FIREBASE_STORAGE_PATH = "site_assets/splash_image";
const BACKGROUND_IMAGE_FIREBASE_STORAGE_PATH = "site_assets/background_image";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const DEFAULT_SPLASH_WELCOME_MESSAGE = "Welcome to AI Chat";
const DEFAULT_TYPING_SPEED_MS = 40;
const DEFAULT_MAINTENANCE_MESSAGE = "Exciting updates are on the way! We'll be back online shortly.";


export default function SiteSettingsPage() {
  const [splashImagePreview, setSplashImagePreview] = useState<string>(DEFAULT_SPLASH_IMAGE_SRC);
  const [selectedSplashFile, setSelectedSplashFile] = useState<File | null>(null);
  const [backgroundImagePreview, setBackgroundImagePreview] = useState<string>(DEFAULT_BACKGROUND_IMAGE_SRC);
  const [selectedBackgroundFile, setSelectedBackgroundFile] = useState<File | null>(null);
  const [splashWelcomeMessage, setSplashWelcomeMessage] = useState<string>(DEFAULT_SPLASH_WELCOME_MESSAGE);
  const [typingSpeedMs, setTypingSpeedMs] = useState<string>(String(DEFAULT_TYPING_SPEED_MS));
  const [maintenanceModeEnabled, setMaintenanceModeEnabled] = useState(false);
  const [maintenanceModeMessage, setMaintenanceModeMessage] = useState('');
  const [showLanguageSelector, setShowLanguageSelector] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const splashImageInputRef = useRef<HTMLInputElement>(null);
  const backgroundImageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchSiteAssets = async () => {
      setIsLoadingData(true);
      const docRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
      try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSplashImagePreview(data.splashImageUrl || DEFAULT_SPLASH_IMAGE_SRC);
          setBackgroundImagePreview(data.backgroundUrl || DEFAULT_BACKGROUND_IMAGE_SRC);
          setSplashWelcomeMessage(data.splashWelcomeMessage || DEFAULT_SPLASH_WELCOME_MESSAGE);
          setTypingSpeedMs(data.typingSpeedMs === undefined ? String(DEFAULT_TYPING_SPEED_MS) : String(data.typingSpeedMs));
          setMaintenanceModeEnabled(data.maintenanceModeEnabled === undefined ? false : data.maintenanceModeEnabled);
          setMaintenanceModeMessage(data.maintenanceModeMessage || DEFAULT_MAINTENANCE_MESSAGE);
          setShowLanguageSelector(data.showLanguageSelector === undefined ? true : data.showLanguageSelector);
        } else {
          // If the document doesn't exist, we can create it with defaults.
          const defaultSettings = {
            splashImageUrl: DEFAULT_SPLASH_IMAGE_SRC,
            backgroundUrl: DEFAULT_BACKGROUND_IMAGE_SRC,
            splashWelcomeMessage: DEFAULT_SPLASH_WELCOME_MESSAGE,
            typingSpeedMs: DEFAULT_TYPING_SPEED_MS,
            maintenanceModeEnabled: false,
            maintenanceModeMessage: DEFAULT_MAINTENANCE_MESSAGE,
            showLanguageSelector: true,
          };
          await setDoc(docRef, defaultSettings, { merge: true });
          setSplashImagePreview(DEFAULT_SPLASH_IMAGE_SRC);
          setBackgroundImagePreview(DEFAULT_BACKGROUND_IMAGE_SRC);
          setSplashWelcomeMessage(DEFAULT_SPLASH_WELCOME_MESSAGE);
          setTypingSpeedMs(String(DEFAULT_TYPING_SPEED_MS));
          setMaintenanceModeEnabled(false);
          setMaintenanceModeMessage(DEFAULT_MAINTENANCE_MESSAGE);
          setShowLanguageSelector(true);
          toast({ title: "Initial Settings Created", description: "Default site settings have been saved." });
        }
      } catch (error) {
        console.error("Error fetching/initializing site assets from Firestore:", error);
        setSplashImagePreview(DEFAULT_SPLASH_IMAGE_SRC);
        setBackgroundImagePreview(DEFAULT_BACKGROUND_IMAGE_SRC);
        setSplashWelcomeMessage(DEFAULT_SPLASH_WELCOME_MESSAGE);
        setTypingSpeedMs(String(DEFAULT_TYPING_SPEED_MS));
        setMaintenanceModeEnabled(false);
        setMaintenanceModeMessage(DEFAULT_MAINTENANCE_MESSAGE);
        setShowLanguageSelector(true);
        toast({
          title: "Error Loading Settings",
          description: "Could not fetch site settings. Defaults shown. Please check console.",
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
      reader.onloadend = () => { setSplashImagePreview(reader.result as string); };
      reader.readAsDataURL(file);
    }
  };
  
  const handleBackgroundImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedBackgroundFile(file);
      const reader = new FileReader();
      reader.onloadend = () => { setBackgroundImagePreview(reader.result as string); };
      reader.readAsDataURL(file);
    }
  };

  const handleSplashWelcomeMessageChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSplashWelcomeMessage(event.target.value);
  };
  
  const handleTypingSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*$/.test(value)) {
      setTypingSpeedMs(value);
    }
  };


  const handleSaveAllSiteSettings = async () => {
    setIsSaving(true);
    const siteAssetsDocRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
    let newSplashImageUrl = splashImagePreview;
    let newBackgroundUrl = backgroundImagePreview;
    let splashImageUpdated = false;
    let backgroundImageUpdated = false;

    if (selectedSplashFile) {
      const fileRef = storageRef(storage, SPLASH_IMAGE_FIREBASE_STORAGE_PATH);
      try {
        await uploadBytes(fileRef, selectedSplashFile);
        newSplashImageUrl = await getDownloadURL(fileRef);
        splashImageUpdated = true;
      } catch (uploadError: any) {
        toast({ title: "Splash Image Error", description: `Could not upload splash image: ${uploadError.message}.`, variant: "destructive" });
        setIsSaving(false); return;
      }
    }
    
    if (selectedBackgroundFile) {
      const fileRef = storageRef(storage, BACKGROUND_IMAGE_FIREBASE_STORAGE_PATH);
      try {
        await uploadBytes(fileRef, selectedBackgroundFile);
        newBackgroundUrl = await getDownloadURL(fileRef);
        backgroundImageUpdated = true;
      } catch (uploadError: any) {
        toast({ title: "Background Image Error", description: `Could not upload background image: ${uploadError.message}.`, variant: "destructive" });
        setIsSaving(false); return;
      }
    }

    const speedMs = parseInt(typingSpeedMs, 10);
    const validTypingSpeed = isNaN(speedMs) || speedMs <= 0 ? DEFAULT_TYPING_SPEED_MS : speedMs;

    try {
      const dataToUpdate: { [key: string]: any } = {};
      const currentDocSnap = await getDoc(siteAssetsDocRef);
      const currentData = currentDocSnap.data() || {};

      let changesMade = false;
      
      if (splashImageUpdated || newSplashImageUrl !== currentData.splashImageUrl) {
        dataToUpdate.splashImageUrl = newSplashImageUrl;
        changesMade = true;
      }
      
      if (backgroundImageUpdated || newBackgroundUrl !== currentData.backgroundUrl) {
        dataToUpdate.backgroundUrl = newBackgroundUrl;
        changesMade = true;
      }

      if (splashWelcomeMessage !== (currentData.splashWelcomeMessage || DEFAULT_SPLASH_WELCOME_MESSAGE)) {
        dataToUpdate.splashWelcomeMessage = splashWelcomeMessage;
        changesMade = true;
      }
      
      if (validTypingSpeed !== (currentData.typingSpeedMs === undefined ? DEFAULT_TYPING_SPEED_MS : currentData.typingSpeedMs)) {
        dataToUpdate.typingSpeedMs = validTypingSpeed;
        changesMade = true;
      }
      
      if (maintenanceModeEnabled !== (currentData.maintenanceModeEnabled === undefined ? false : currentData.maintenanceModeEnabled)) {
        dataToUpdate.maintenanceModeEnabled = maintenanceModeEnabled;
        changesMade = true;
      }

      if (maintenanceModeMessage !== (currentData.maintenanceModeMessage || DEFAULT_MAINTENANCE_MESSAGE)) {
          dataToUpdate.maintenanceModeMessage = maintenanceModeMessage;
          changesMade = true;
      }
      
      if (showLanguageSelector !== (currentData.showLanguageSelector === undefined ? true : currentData.showLanguageSelector)) {
        dataToUpdate.showLanguageSelector = showLanguageSelector;
        changesMade = true;
      }

      if (changesMade) {
        await updateDoc(siteAssetsDocRef, dataToUpdate);
        
        toast({ title: "Site Settings Saved", description: "Your site display settings have been updated." });
        
        if (splashImageUpdated) {
          setSplashImagePreview(newSplashImageUrl);
          setSelectedSplashFile(null);
        } else if (dataToUpdate.splashImageUrl === DEFAULT_SPLASH_IMAGE_SRC) {
          setSplashImagePreview(DEFAULT_SPLASH_IMAGE_SRC);
        }
        
        if (backgroundImageUpdated) {
          setBackgroundImagePreview(newBackgroundUrl);
          setSelectedBackgroundFile(null);
        } else if (dataToUpdate.backgroundUrl === DEFAULT_BACKGROUND_IMAGE_SRC) {
          setBackgroundImagePreview(DEFAULT_BACKGROUND_IMAGE_SRC);
        }

      } else {
        toast({ title: "No Changes", description: "No display setting changes detected to save." });
      }
    } catch (error) {
      console.error("Error saving site settings:", error);
      toast({ title: "Save Error", description: "Could not save site settings.", variant: "destructive" });
    }
    setIsSaving(false);
  };


  const handleResetSplashImage = () => {
    setSplashImagePreview(DEFAULT_SPLASH_IMAGE_SRC);
    setSelectedSplashFile(null);
    if(splashImageInputRef.current) splashImageInputRef.current.value = "";
    toast({ title: "Splash Image Preview Reset", description: "Click 'Save Site Settings' to make it permanent."});
  };
  
  const handleResetBackgroundImage = () => {
    setBackgroundImagePreview(DEFAULT_BACKGROUND_IMAGE_SRC);
    setSelectedBackgroundFile(null);
    if(backgroundImageInputRef.current) backgroundImageInputRef.current.value = "";
    toast({ title: "Background Image Preview Reset", description: "Click 'Save Site Settings' to make it permanent."});
  };

  const handleResetSplashWelcomeMessage = () => {
    setSplashWelcomeMessage(DEFAULT_SPLASH_WELCOME_MESSAGE);
    toast({ title: "Welcome Message Reset", description: "Click 'Save Site Settings' to make it permanent."});
  };
  
  const handleResetTypingSpeed = () => {
    setTypingSpeedMs(String(DEFAULT_TYPING_SPEED_MS));
    toast({ title: "Typing Speed Reset", description: "Click 'Save Site Settings' to make it permanent." });
  };
  
  const handleResetMaintenanceMode = () => {
    setMaintenanceModeEnabled(false);
    setMaintenanceModeMessage(DEFAULT_MAINTENANCE_MESSAGE);
    toast({ title: "Maintenance Mode Reset", description: "Click 'Save Site Settings' to make it permanent." });
  };

  const handleResetLanguageSelector = () => {
    setShowLanguageSelector(true);
    toast({ title: "Language Selector Reset", description: "Click 'Save Site Settings' to make it permanent." });
  };

  return (
    <div className="space-y-6">
       <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2"><Monitor /> Page Background Image</CardTitle>
          <CardDescription>
            Upload a background image for the Start and Maintenance pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingData ? (
              <div className="w-full h-[200px] bg-muted rounded-lg flex items-center justify-center"><p>Loading...</p></div>
          ) : (
            <div className="flex flex-col items-center space-y-4">
              <Label htmlFor="background-image-upload" className="font-medium self-start sr-only">Background Image</Label>
              <Image
                src={backgroundImagePreview}
                alt="Background Preview"
                width={400}
                height={267}
                className="rounded-lg border-2 border-primary shadow-md object-cover"
                unoptimized={backgroundImagePreview.startsWith('data:image/') || backgroundImagePreview.startsWith('blob:')}
                onError={() => setBackgroundImagePreview(DEFAULT_BACKGROUND_IMAGE_SRC)}
                data-ai-hint="office building exterior"
              />
              <Input
                type="file"
                accept="image/*"
                ref={backgroundImageInputRef}
                onChange={handleBackgroundImageChange}
                className="hidden"
                id="background-image-upload"
              />
              <Button variant="outline" onClick={() => backgroundImageInputRef.current?.click()} className="w-full max-w-xs" disabled={isLoadingData}>
                <UploadCloud className="mr-2 h-4 w-4" /> Choose Background Image
              </Button>
              {selectedBackgroundFile && <p className="text-xs text-muted-foreground">New: {selectedBackgroundFile.name}</p>}
            </div>
          )}
        </CardContent>
        <CardFooter>
            <Button variant="outline" onClick={handleResetBackgroundImage} disabled={isLoadingData}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reset Background
            </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2"><ImageIcon /> Splash Screen Image</CardTitle>
          <CardDescription>
            Upload the image for the splash screen card. Stored in Firebase Storage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingData ? (
              <div className="w-full max-w-md h-[200px] bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center mx-auto">
                <p className="text-muted-foreground">Loading image settings...</p>
              </div>
          ) : (
            <div className="flex flex-col items-center space-y-4">
              <Label htmlFor="splash-image-upload" className="font-medium self-start sr-only">Splash Image Preview &amp; Upload</Label>
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
              <RotateCcw className="mr-2 h-4 w-4" /> Reset Splash Image
            </Button>
        </CardFooter>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2"><MessageSquare /> Splash Screen Welcome Message</CardTitle>
          <CardDescription>
            Customize the main welcome message displayed on the application&apos;s splash screen.
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
                Default: &quot;{DEFAULT_SPLASH_WELCOME_MESSAGE}&quot;
              </p>
            </>
          )}
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={handleResetSplashWelcomeMessage} disabled={isLoadingData}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset Message
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><Construction /> Maintenance Mode</CardTitle>
            <CardDescription>
            Enable this to show an &quot;Updates Are Coming&quot; page to all users, preventing access to the chat.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            {isLoadingData ? (
            <p>Loading maintenance settings...</p>
            ) : (
            <>
                <div className="flex items-center space-x-3 rounded-md border p-3 shadow-sm">
                    <div className="flex-1 space-y-1">
                        <Label htmlFor="maintenanceModeEnabled" className="font-medium">
                            Enable &quot;Updates Are Coming&quot; Page
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            If ON, all users will be redirected to this page.
                        </p>
                    </div>
                    <Switch
                        id="maintenanceModeEnabled"
                        checked={maintenanceModeEnabled}
                        onCheckedChange={setMaintenanceModeEnabled}
                        disabled={isLoadingData}
                        aria-label="Toggle maintenance mode"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="maintenanceModeMessage">Custom Message</Label>
                    <Textarea
                        id="maintenanceModeMessage"
                        value={maintenanceModeMessage}
                        onChange={(e) => setMaintenanceModeMessage(e.target.value)}
                        placeholder="Enter the message to display on the maintenance page..."
                        rows={3}
                        className="mt-1"
                        disabled={isLoadingData || !maintenanceModeEnabled}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                    This message will be shown to users. Default: &quot;{DEFAULT_MAINTENANCE_MESSAGE}&quot;
                    </p>
                </div>
            </>
            )}
        </CardContent>
        <CardFooter>
            <Button variant="outline" onClick={handleResetMaintenanceMode} disabled={isLoadingData}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset Maintenance Settings
            </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><Globe /> Language Selector</CardTitle>
            <CardDescription>
              Control the visibility of the language selector on the start page.
            </CardDescription>
        </CardHeader>
        <CardContent>
            {isLoadingData ? (
            <p>Loading language settings...</p>
            ) : (
                <div className="flex items-center space-x-3 rounded-md border p-3 shadow-sm">
                    <div className="flex-1 space-y-1">
                        <Label htmlFor="showLanguageSelector" className="font-medium">
                            Show Language Selector
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            If ON, the English/Spanish toggle will be visible on the start page.
                        </p>
                    </div>
                    <Switch
                        id="showLanguageSelector"
                        checked={showLanguageSelector}
                        onCheckedChange={setShowLanguageSelector}
                        disabled={isLoadingData}
                        aria-label="Toggle language selector visibility"
                    />
                </div>
            )}
        </CardContent>
        <CardFooter>
            <Button variant="outline" onClick={handleResetLanguageSelector} disabled={isLoadingData}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset Language Selector
            </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2"><Type className="h-5 w-5" /> AI Speech Text Typing Animation</CardTitle>
          <CardDescription>
            Configure the letter-by-letter typing animation effect for AI Blair&apos;s speech.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingData ? (
            <p>Loading animation settings...</p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="typingSpeedMs" className="font-medium flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> Average Typing Delay (ms)
              </Label>
              <Input
                id="typingSpeedMs"
                type="number"
                value={typingSpeedMs}
                onChange={handleTypingSpeedChange}
                placeholder="e.g., 40"
                min="10"
                step="5"
                disabled={isLoadingData}
              />
              <p className="text-xs text-muted-foreground">
                The average delay between each character appearing. Lower is faster. Default: {DEFAULT_TYPING_SPEED_MS}ms.
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={handleResetTypingSpeed} disabled={isLoadingData}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset Typing Speed
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

    
