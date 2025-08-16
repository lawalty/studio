
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { Save, UploadCloud, RotateCcw, Clock, Type, Construction, Globe, Monitor, AlertTriangle, Archive, Trash2, Loader2 } from 'lucide-react';
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AdminNav from '@/components/admin/AdminNav';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { clearUsageStats } from '@/ai/flows/clear-usage-stats-flow';


const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const DEFAULT_BACKGROUND_IMAGE_SRC = TRANSPARENT_PIXEL;
const DEFAULT_TYPING_SPEED_MS = 40;
const DEFAULT_MAINTENANCE_MESSAGE = "Exciting updates are on the way! We'll be back online shortly.";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const BACKGROUND_IMAGE_FIREBASE_STORAGE_PATH = "site_assets/background_image";


export default function SiteSettingsPage() {
  const [backgroundImagePreview, setBackgroundImagePreview] = useState<string>(DEFAULT_BACKGROUND_IMAGE_SRC);
  const [selectedBackgroundFile, setSelectedBackgroundFile] = useState<File | null>(null);
  const [typingSpeedMs, setTypingSpeedMs] = useState<string>(String(DEFAULT_TYPING_SPEED_MS));
  const [maintenanceModeEnabled, setMaintenanceModeEnabled] = useState(false);
  const [maintenanceModeMessage, setMaintenanceModeMessage] = useState('');
  const [showLanguageSelector, setShowLanguageSelector] = useState(true);
  const [archiveChatHistoryEnabled, setArchiveChatHistoryEnabled] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isClearingStats, setIsClearingStats] = useState(false);
  const backgroundImageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchSiteAssets = async () => {
      setIsLoadingData(true);
      setConfigError(null);
      const docRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
      try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
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
          await setDoc(docRef, defaultSettings, { merge: true });
          // Set state to defaults
          setBackgroundImagePreview(DEFAULT_BACKGROUND_IMAGE_SRC);
          setTypingSpeedMs(String(DEFAULT_TYPING_SPEED_MS));
          setMaintenanceModeEnabled(false);
          setMaintenanceModeMessage(DEFAULT_MAINTENANCE_MESSAGE);
          setShowLanguageSelector(true);
          setArchiveChatHistoryEnabled(true);
          toast({ title: "Initial Settings Created", description: "Default site settings have been saved." });
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
    fetchSiteAssets();
  }, [toast]);

  
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
      const dataToUpdate: { [key: string]: any } = {};
      const currentDocSnap = await getDoc(siteAssetsDocRef);
      const currentData = currentDocSnap.data() || {};

      let changesMade = false;
      
      if (backgroundImageUpdated || newBackgroundUrl !== currentData.backgroundUrl) {
        dataToUpdate.backgroundUrl = newBackgroundUrl;
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

      if (archiveChatHistoryEnabled !== (currentData.archiveChatHistoryEnabled === undefined ? true : currentData.archiveChatHistoryEnabled)) {
        dataToUpdate.archiveChatHistoryEnabled = archiveChatHistoryEnabled;
        changesMade = true;
      }

      if (changesMade) {
        await updateDoc(siteAssetsDocRef, dataToUpdate);
        
        toast({ title: "Site Settings Saved", description: "Your site display settings have been updated." });
        
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
