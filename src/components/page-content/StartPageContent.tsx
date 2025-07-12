
'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Mic, Bot, MessageSquareText, AlertTriangle, UploadCloud, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import LanguageSelector from '@/components/layout/LanguageSelector';
import { useLanguage } from '@/context/LanguageContext';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';

const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const DEFAULT_SPLASH_IMAGE_SRC = TRANSPARENT_PIXEL;
const DEFAULT_BACKGROUND_IMAGE_SRC = TRANSPARENT_PIXEL;
const DEFAULT_WELCOME_MESSAGE = "Welcome to AI Chat";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const DEFAULT_TYPING_SPEED_MS = 50;

const TARGET_ANIMATION_MESSAGE = "Let's have a conversation.";
const TEXT_ELEMENTS_EN = {
  chooseMode: "Choose your interaction mode to begin.",
  audioOnly: "Audio Only",
  audioText: "Audio & Text",
  textOnly: "Text Only",
};

export default function StartPageContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [splashImageSrc, setSplashImageSrc] = useState<string>(DEFAULT_SPLASH_IMAGE_SRC);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState<string>(DEFAULT_WELCOME_MESSAGE);
  const [typingSpeedMs, setTypingSpeedMs] = useState(DEFAULT_TYPING_SPEED_MS);
  const [typedMessage, setTypedMessage] = useState('');
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState<boolean | null>(null);
  const [showLanguageSelector, setShowLanguageSelector] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language, translate } = useLanguage();

  const [uiText, setUiText] = useState({
    welcome: welcomeMessage,
    typedAnim: TARGET_ANIMATION_MESSAGE,
    ...TEXT_ELEMENTS_EN,
  });

  // Keydown listener for admin access
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        router.push('/admin');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [router]);

  // Firestore listener for dynamic settings
  useEffect(() => {
    const docRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
    const unsubscribe = onSnapshot(docRef, async (docSnap) => {
      setConfigError(null);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.maintenanceModeEnabled) {
          setIsMaintenanceMode(true);
        } else {
          setWelcomeMessage(data.splashWelcomeMessage || DEFAULT_WELCOME_MESSAGE);
          setSplashImageSrc(data.splashImageUrl || DEFAULT_SPLASH_IMAGE_SRC);
          setBackgroundUrl(data.backgroundUrl || null);
          setTypingSpeedMs(data.typingSpeedMs === undefined ? DEFAULT_TYPING_SPEED_MS : data.typingSpeedMs);
          setShowLanguageSelector(data.showLanguageSelector === undefined ? true : data.showLanguageSelector);
          setIsMaintenanceMode(false);
        }
      } else {
        // Document doesn't exist, so create it with default values.
        try {
            const defaultSettings = {
                splashWelcomeMessage: DEFAULT_WELCOME_MESSAGE,
                splashImageUrl: DEFAULT_SPLASH_IMAGE_SRC,
                backgroundUrl: DEFAULT_BACKGROUND_IMAGE_SRC,
                typingSpeedMs: DEFAULT_TYPING_SPEED_MS,
                maintenanceModeEnabled: false,
                maintenanceModeMessage: "Exciting updates are on the way! We'll be back online shortly.",
                showLanguageSelector: true,
            };
            await setDoc(docRef, defaultSettings);
            // After creating, set state to defaults
            setWelcomeMessage(DEFAULT_WELCOME_MESSAGE);
            setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC);
            setBackgroundUrl(null);
            setTypingSpeedMs(DEFAULT_TYPING_SPEED_MS);
            setShowLanguageSelector(true);
            setIsMaintenanceMode(false);
        } catch (error) {
            console.error("Error creating default site settings:", error);
            setConfigError("Could not create default site settings in Firestore. Please check permissions.");
        }
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching site settings:", error);
      setConfigError("Could not load site settings. This is often caused by an incorrect Firebase configuration in your .env.local file or security rules that block access. Please check your setup.");
      setIsLoading(false);
      // Set defaults so the page is still somewhat functional
      setWelcomeMessage(DEFAULT_WELCOME_MESSAGE);
      setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC);
      setBackgroundUrl(null);
    });

    return () => unsubscribe();
  }, []);

  // Effect for handling translations
  useEffect(() => {
    const translateUi = async () => {
      if (language === 'English') {
        setUiText({
          welcome: welcomeMessage,
          typedAnim: TARGET_ANIMATION_MESSAGE,
          ...TEXT_ELEMENTS_EN,
        });
        return;
      }
      
      const [
        translatedWelcome,
        translatedTypedAnim,
        translatedChooseMode,
        translatedAudioOnly,
        translatedAudioText,
        translatedTextOnly,
      ] = await Promise.all([
        translate(welcomeMessage),
        translate(TARGET_ANIMATION_MESSAGE),
        translate(TEXT_ELEMENTS_EN.chooseMode),
        translate(TEXT_ELEMENTS_EN.audioOnly),
        translate(TEXT_ELEMENTS_EN.audioText),
        translate(TEXT_ELEMENTS_EN.textOnly),
      ]);
      
      setUiText({
        welcome: translatedWelcome,
        typedAnim: translatedTypedAnim,
        chooseMode: translatedChooseMode,
        audioOnly: translatedAudioOnly,
        audioText: translatedAudioText,
        textOnly: translatedTextOnly,
      });
    };
    
    if (!isLoading) {
      translateUi();
    }
  }, [language, welcomeMessage, isLoading, translate]);

  // Typing animation effect
  useEffect(() => {
    let animationDelayTimer: NodeJS.Timeout | null = null;
    let typingTimer: NodeJS.Timeout | null = null;

    if (!isLoading && isImageLoaded && !configError) {
      animationDelayTimer = setTimeout(() => {
        setTypedMessage(''); 
        let i = 0;
        const targetMessage = uiText.typedAnim;
        
        typingTimer = setInterval(() => {
          i++;
          setTypedMessage(targetMessage.substring(0, i));
          if (i >= targetMessage.length) {
            clearInterval(typingTimer!);
          }
        }, typingSpeedMs);
      }, 3000); 
    } else {
      setTypedMessage('');
    }

    return () => {
      if (animationDelayTimer) clearTimeout(animationDelayTimer);
      if (typingTimer) clearInterval(typingTimer);
    };
  }, [isLoading, isImageLoaded, typingSpeedMs, uiText.typedAnim, configError]);
  
  // Image loading effect
  useEffect(() => {
    if (splashImageSrc === DEFAULT_SPLASH_IMAGE_SRC || !splashImageSrc) {
      setIsImageLoaded(true);
    } else {
      setIsImageLoaded(false);
    }
  }, [splashImageSrc]);

  // Maintenance mode redirect effect
  useEffect(() => {
    const isPreview = searchParams.get('preview') === 'true';

    if (isMaintenanceMode === true && !isPreview) {
      router.replace('/updates-coming');
    }
  }, [isMaintenanceMode, router, searchParams]);


  const renderContent = () => {
    if (isLoading || isMaintenanceMode === null) {
      return (
        <Card className="w-full max-w-2xl p-6 text-center shadow-2xl border bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <Skeleton className="h-8 w-3/4 mx-auto" />
            <Skeleton className="h-6 w-1/2 mx-auto mt-2" />
          </CardHeader>
          <CardContent className="space-y-6 mt-6">
            <Skeleton className="w-full h-[267px] rounded-lg" />
            <Skeleton className="h-6 w-3/4 mx-auto" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </CardContent>
        </Card>
      );
    }
    
    if (configError) {
        return (
            <Card className="w-full max-w-2xl p-6 text-center shadow-2xl border bg-card/80 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="text-2xl font-headline text-destructive flex items-center justify-center gap-2">
                        <AlertTriangle /> Application Error
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Alert variant="destructive">
                        <AlertTitle>Could not load configuration</AlertTitle>
                        <AlertDescription>{configError}</AlertDescription>
                    </Alert>
                </CardContent>
            </Card>
        )
    }

    return (
      <>
        <Card className="w-full max-w-2xl p-6 space-y-6 text-center shadow-2xl border bg-card/80 backdrop-blur-sm">
          <CardHeader className="p-0">
            <CardTitle className="text-4xl font-headline text-primary">
              {uiText.welcome}
            </CardTitle>
            <p className="text-lg text-muted-foreground h-7 animate-in fade-in delay-500">
              {typedMessage}
            </p>
          </CardHeader>
          <CardContent className="p-0 space-y-6">
            <Image
              src={splashImageSrc}
              alt="AI Blair welcome splash"
              width={400}
              height={267}
              className={cn(
                "rounded-lg shadow-md object-cover w-full h-auto transition-opacity duration-700 ease-in-out",
                isImageLoaded ? "opacity-100" : "opacity-0"
              )}
              priority
              unoptimized={splashImageSrc.startsWith('data:image/')}
              onLoad={() => setIsImageLoaded(true)}
              onError={() => {
                setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC);
                setIsImageLoaded(true);
              }}
              data-ai-hint={splashImageSrc === DEFAULT_SPLASH_IMAGE_SRC ? undefined : "technology abstract welcome"}
            />
            <div className="flex items-center justify-center gap-2">
              <CardDescription className="text-lg m-0">
                {uiText.chooseMode}
              </CardDescription>
              {showLanguageSelector && <LanguageSelector />}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Button asChild variant="outline" size="lg" className="h-auto py-4 flex flex-col gap-2">
                <Link href="/chat/audio-only">
                  <Mic className="h-8 w-8 text-primary" />
                  <span className="font-semibold">{uiText.audioOnly}</span>
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-auto py-4 flex flex-col gap-2">
                <Link href="/chat/audio-text">
                  <Bot className="h-8 w-8 text-primary" />
                  <span className="font-semibold">{uiText.audioText}</span>
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-auto py-4 flex flex-col gap-2">
                <Link href="/chat/text-only">
                  <MessageSquareText className="h-8 w-8 text-primary" />
                  <span className="font-semibold">{uiText.textOnly}</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  };

  return (
    <div className="relative flex flex-col items-center justify-center flex-grow p-4">
       {backgroundUrl && backgroundUrl !== DEFAULT_BACKGROUND_IMAGE_SRC && (
        <Image
          src={backgroundUrl}
          alt="Background"
          fill
          className="object-cover z-[-1] filter blur-sm brightness-75"
          priority
          data-ai-hint={backgroundUrl === DEFAULT_BACKGROUND_IMAGE_SRC ? undefined : "office building exterior"}
          unoptimized={backgroundUrl.startsWith('data:image/')}
        />
      )}
      {renderContent()}
      <p className="mt-4 rounded-md bg-white/80 p-2 text-center text-xs text-foreground shadow-lg backdrop-blur-sm dark:bg-black/60 dark:text-white">
        Press Ctrl + Shift + A to access the admin panel.
      </p>
    </div>
  );
}
