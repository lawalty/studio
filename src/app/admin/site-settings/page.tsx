
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { Save, UploadCloud, RotateCcw, Clock, Type, Construction, Globe, Monitor, AlertTriangle, Archive, Trash2, Loader2, Bot } from 'lucide-react';
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AdminNav from '@/components/admin/AdminNav';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { clearUsageStats } from '@/ai/flows/clear-usage-stats-flow';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';


const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const DEFAULT_BACKGROUND_IMAGE_SRC = TRANSPARENT_PIXEL;
const DEFAULT_TYPING_SPEED_MS = 40;
const DEFAULT_MAINTENANCE_MESSAGE = "Exciting updates are on the way! We'll be back online shortly.";
const DEFAULT_CONVERSATIONAL_MODEL = 'gemini-1.5-pro-latest';
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const FIRESTORE_APP_CONFIG_PATH = "configurations/app_config";
const BACKGROUND_IMAGE_FIREBASE_STORAGE_PATH = "site_assets/background_image";

const modelOptions = [
    {
        name: 'Gemini 1.5 Flash',
        value: 'gemini-1.5-flash-latest',
        description: "The speed-and-cost optimized model from the previous generation. It's a reliable workhorse for tasks that need to be fast and efficient."
    },
    {
        name: 'Gemini 1.5 Pro',
        value: 'gemini-1.5-pro-latest',
        description: "The previous generation's flagship model. It remains an extremely powerful and popular choice, especially known for its very large context window."
    },
    {
        name: 'Gemini 2.5 Flash',
        value: 'gemini-2.5-flash',
        description: "The newest high-efficiency model. It offers a powerful balance of speed, quality, and cost, making it ideal for high-volume or latency-sensitive tasks."
    },
    {
        name: 'Gemini 2.5 Pro',
        value: 'gemini-2.5-pro',
        description: "This is the most powerful and capable flagship model, designed for the highest level of complex reasoning and performance."
    }
];

export default function SiteSettingsPage() {
  const [backgroundImagePreview, setBackgroundImagePreview] = useState<string>(DEFAULT_BACKGROUND_IMAGE_SRC);
  const [selectedBackgroundFile, setSelectedBackgroundFile] = useState<File | null>(null);
  const [typingSpeedMs, setTypingSpeedMs] = useState<string>(String(DEFAULT_TYPING_SPEED_MS));
  const [maintenanceModeEnabled, setMaintenanceModeEnabled] = useState(false);
  const [maintenanceModeMessage, setMaintenanceModeMessage] = useState('');
  const [showLanguageSelector, setShowLanguageSelector] = useState(true);
  const [archiveChatHistoryEnabled, setArchiveChatHistoryEnabled] = useState(true);
  const [conversationalModel, setConversationalModel] = useState(DEFAULT_CONVERSATIONAL_MODEL);
  const [configError, setConfigError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isClearingStats, setIsClearingStats] = useState(false);
  const backgroundImageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoadingData(true);
      setConfigError(null);
      
      const siteAssetsDocRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
      const appConfigDocRef = doc(db, FIRESTORE_APP_CONFIG_PATH);
      
      try {
        const [siteAssetsSnap, appConfigSnap] = await Promise.all([
          getDoc(siteAssetsDocRef),
          getDoc(appConfigDocRef)
        ]);

        if (siteAssetsSnap.exists()) {
          const data = siteAssetsSnap.data();
          setBackgroundImagePreview(data.backgroundUrl || DEFAULT_BACKGROUND_IMAGE_SRC);
          setTypingSpeedMs(data.typingSpeedMs === undefined ? String(DEFAULT_TYPING_SPEED_MS) : String(data.typingSpeedMs));
          setMaintenanceModeEnabled(data.maintenanceModeEnabled === undefined ? false : data.maintenanceModeEnabled);
          setMaintenanceModeMessage(data.maintenanceModeMessage || DEFAULT_MAINTENANCE_MESSAGE);
          setShowLanguageSelector(data.showLanguageSelector === undefined ? true : data.showLanguageSelector);
          setArchiveChatHistoryEnabled(data.archiveChatHistoryEnabled === undefined ? true : data.archiveChatHistoryEnabled);
        } else {
          // On first run, create the doc with defaults
          const defaultSettings = {
            backgroundUrl: DEFAULT_BACKGROUND_IMAGE_SRC,
            typingSpeedMs: DEFAULT_TYPING_SPEED_MS,
            maintenanceModeEnabled: false,
            maintenanceModeMessage: DEFAULT_MAINTENANCE_MESSAGE,
            showLanguageSelector: true,
            archiveChatHistoryEnabled: true,
          };
          await setDoc(siteAssetsDocRef, defaultSettings, { merge: true });
        }
        
        if (appConfigSnap.exists()) {
            const data = appConfigSnap.data();
            setConversationalModel(data.conversationalModel || DEFAULT_CONVERSATIONAL_MODEL);
        } else {
            await setDoc(appConfigDocRef, { conversationalModel: DEFAULT_CONVERSATIONAL_MODEL }, { merge: true });
        }

      } catch (error: any) {
        console.error("Error fetching/initializing site assets from Firestore:", error);
        const detailedMessage = `Could not fetch site settings. This is often caused by an issue with your Firebase connection or permissions.

Possible Causes:
1.  The Firebase Project ID in your .env.local file is incorrect.
2.  The "Cloud Firestore API" is not enabled in your Google Cloud project.
3.  Your firestore.rules file is preventing read access.

Please check your environment variables and Google Cloud Console settings.`;
        setConfigError(detailedMessage);
      }
      setIsLoadingData(false);
    };
    fetchSettings();
  }, []);

  
  const handleBackgroundImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedBackgroundFile(file);
      const reader = new FileReader();
      reader.onloadend = () => { setBackgroundImagePreview(reader.result as string); };
      reader.readAsDataURL(file);
    }
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
    const appConfigDocRef = doc(db, FIRESTORE_APP_CONFIG_PATH);

    let newBackgroundUrl = backgroundImagePreview;
    let backgroundImageUpdated = false;
    
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
      // Data for site_display_assets
      const siteAssetsUpdate: { [key: string]: any } = {};
      const currentSiteAssetsSnap = await getDoc(siteAssetsDocRef);
      const currentSiteAssets = currentSiteAssetsSnap.data() || {};
      
      let siteAssetsChanged = false;
      if (backgroundImageUpdated || newBackgroundUrl !== currentSiteAssets.backgroundUrl) {
        siteAssetsUpdate.backgroundUrl = newBackgroundUrl; siteAssetsChanged = true;
      }
      if (validTypingSpeed !== (currentSiteAssets.typingSpeedMs ?? DEFAULT_TYPING_SPEED_MS)) {
        siteAssetsUpdate.typingSpeedMs = validTypingSpeed; siteAssetsChanged = true;
      }
      if (maintenanceModeEnabled !== (currentSiteAssets.maintenanceModeEnabled ?? false)) {
        siteAssetsUpdate.maintenanceModeEnabled = maintenanceModeEnabled; siteAssetsChanged = true;
      }
      if (maintenanceModeMessage !== (currentSiteAssets.maintenanceModeMessage || DEFAULT_MAINTENANCE_MESSAGE)) {
          siteAssetsUpdate.maintenanceModeMessage = maintenanceModeMessage; siteAssetsChanged = true;
      }
      if (showLanguageSelector !== (currentSiteAssets.showLanguageSelector ?? true)) {
        siteAssetsUpdate.showLanguageSelector = showLanguageSelector; siteAssetsChanged = true;
      }
      if (archiveChatHistoryEnabled !== (currentSiteAssets.archiveChatHistoryEnabled ?? true)) {
        siteAssetsUpdate.archiveChatHistoryEnabled = archiveChatHistoryEnabled; siteAssetsChanged = true;
      }

      // Data for app_config
      const appConfigUpdate: { [key: string]: any } = {};
      const currentAppConfigSnap = await getDoc(appConfigDocRef);
      const currentAppConfig = currentAppConfigSnap.data() || {};
      
      let appConfigChanged = false;
      if (conversationalModel !== (currentAppConfig.conversationalModel || DEFAULT_CONVERSATIONAL_MODEL)) {
          appConfigUpdate.conversationalModel = conversationalModel;
          appConfigChanged = true;
      }
      
      const updatePromises = [];
      if (siteAssetsChanged) {
        updatePromises.push(updateDoc(siteAssetsDocRef, siteAssetsUpdate));
      }
      if (appConfigChanged) {
        updatePromises.push(updateDoc(appConfigDocRef, appConfigUpdate));
      }

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
        toast({ title: "Site Settings Saved", description: "Your site display and app settings have been updated." });
      } else {
        toast({ title: "No Changes", description: "No setting changes detected to save." });
      }

    } catch (error) {
      console.error("Error saving site settings:", error);
      toast({ title: "Save Error", description: "Could not save site settings.", variant: "destructive" });
    }
    setIsSaving(false);
  };

  
  const handleResetBackgroundImage = () => {
    setBackgroundImagePreview(DEFAULT_BACKGROUND_IMAGE_SRC);
    setSelectedBackgroundFile(null);
    if(backgroundImageInputRef.current) backgroundImageInputRef.current.value = "";
    toast({ title: "Background Image Preview Reset", description: "Click 'Save Site Settings' to make it permanent."});
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

  const handleResetChatArchiving = () => {
    setArchiveChatHistoryEnabled(true);
    toast({ title: "Chat Archiving Reset", description: "Click 'Save Site Settings' to make it permanent." });
  };

  const handleClearStats = useCallback(async () => {
      setIsClearingStats(true);
      toast({ title: 'Clearing usage statistics...' });
      try {
          const result = await clearUsageStats();
          if (result.success) {
              toast({ title: 'Success', description: `${result.deletedCount} chat session records have been deleted.` });
          } else {
              throw new Error(result.error || 'An unknown error occurred.');
          }
      } catch (error: any) {
          console.error('Failed to clear stats:', error);
          toast({ title: 'Error', description: `Could not clear stats. ${error.message}`, variant: 'destructive' });
      } finally {
          setIsClearingStats(false);
      }
  }, [toast]);

  return (
    <div className="space-y-6">
       <AdminNav />
       {configError ? (
        <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Configuration Error</AlertTitle>
            <AlertDescription className="whitespace-pre-wrap">{configError}</AlertDescription>
        </Alert>
       ) : isLoadingData ? (
        <p className="text-center text-muted-foreground">Loading site settings...</p>
       ) : (
        <>
          <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Admin Password Management</AlertTitle>
              <AlertDescription>
                The admin password is now managed exclusively in your <code className="font-mono bg-muted p-1 rounded">.env.local</code> file for improved security and reliability. Edit the <code className="font-mono bg-muted p-1 rounded">ADMIN_PASSWORD</code> variable there.
              </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2"><Bot /> Conversational Model</CardTitle>
              <CardDescription>Select the Gemini model to be used for generating chat responses.</CardDescription>
            </CardHeader>
            <CardContent>
                <RadioGroup value={conversationalModel} onValueChange={setConversationalModel} className="space-y-4">
                    {modelOptions.map(option => (
                        <Label key={option.value} htmlFor={option.value} className="flex items-start gap-4 rounded-md border p-4 cursor-pointer hover:bg-accent/50 has-[:checked]:bg-accent has-[:checked]:border-primary">
                           <RadioGroupItem value={option.value} id={option.value} />
                           <div className="grid gap-1.5">
                                <span className="font-semibold">{option.name}</span>
                                <span className="text-sm text-muted-foreground">{option.description}</span>
                                <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded-sm w-fit">Model: {option.value}</code>
                           </div>
                        </Label>
                    ))}
                </RadioGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2"><Monitor /> Page Background Image</CardTitle>
              <CardDescription>
                Upload a background image for the Start and Maintenance pages.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                    data-ai-hint={backgroundImagePreview === DEFAULT_BACKGROUND_IMAGE_SRC ? undefined : "office building exterior"}
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
            </CardContent>
            <CardFooter>
                <Button variant="outline" onClick={handleResetBackgroundImage} disabled={isLoadingData}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset Background
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
            </CardContent>
            <CardFooter>
                <Button variant="outline" onClick={handleResetLanguageSelector} disabled={isLoadingData}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset Language Selector
                </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
                <CardTitle className="font-headline flex items-center gap-2"><Archive /> Chat History Archiving</CardTitle>
                <CardDescription>
                  Control whether conversations are automatically saved to the Knowledge Base.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center space-x-3 rounded-md border p-3 shadow-sm">
                    <div className="flex-1 space-y-1">
                        <Label htmlFor="archiveChatHistoryEnabled" className="font-medium">
                            Enable Chat History Archiving
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            If ON, conversations will be saved to the &quot;Chat History&quot; KB for future reference by the AI.
                        </p>
                    </div>
                    <Switch
                        id="archiveChatHistoryEnabled"
                        checked={archiveChatHistoryEnabled}
                        onCheckedChange={setArchiveChatHistoryEnabled}
                        disabled={isLoadingData}
                        aria-label="Toggle chat history archiving"
                    />
                </div>
            </CardContent>
            <CardFooter>
                <Button variant="outline" onClick={handleResetChatArchiving} disabled={isLoadingData}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset Chat Archiving
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
            </CardContent>
            <CardFooter>
              <Button variant="outline" onClick={handleResetTypingSpeed} disabled={isLoadingData}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset Typing Speed
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-destructive">
              <CardHeader>
                  <CardTitle className="font-headline text-destructive flex items-center gap-2"><AlertTriangle /> Danger Zone</CardTitle>
                  <CardDescription>
                      These are destructive actions. Be certain before proceeding.
                  </CardDescription>
              </CardHeader>
              <CardContent>
                  <AlertDialog>
                      <AlertDialogTrigger asChild>
                         <Button variant="destructive" disabled={isClearingStats}>
                             <Trash2 className="mr-2 h-4 w-4" /> Clear All Usage Statistics
                         </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                          <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                  This will permanently delete all chat session records used for statistics from the database. This action cannot be undone and will reset the dashboard counters to zero. It will NOT affect the Chat History KB.
                              </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={handleClearStats} disabled={isClearingStats}>
                                  {isClearingStats ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                  Yes, clear all stats
                              </AlertDialogAction>
                          </AlertDialogFooter>
                      </AlertDialogContent>
                  </AlertDialog>
                  <p className="text-xs text-muted-foreground mt-2">
                      This action will wipe all records from the `chat_sessions` collection.
                  </p>
              </CardContent>
          </Card>

          <div className="flex justify-start py-4 mt-4 border-t pt-6">
            <Button onClick={handleSaveAllSiteSettings} disabled={isSaving || isLoadingData} size="lg">
              <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Saving Settings...' : (isLoadingData ? 'Loading...' : 'Save Site Settings')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
