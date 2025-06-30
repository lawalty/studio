
'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Mic, Bot, MessageSquareText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const DEFAULT_SPLASH_IMAGE_SRC = "https://placehold.co/800x600.png";
const DEFAULT_WELCOME_MESSAGE = "Welcome to AI Chat";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const DEFAULT_TYPING_SPEED_MS = 50;
const TARGET_ANIMATION_MESSAGE = "Let's have a conversation.";

export default function StartPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [splashImageSrc, setSplashImageSrc] = useState<string>(DEFAULT_SPLASH_IMAGE_SRC);
  const [welcomeMessage, setWelcomeMessage] = useState<string>(DEFAULT_WELCOME_MESSAGE);
  const [typingSpeedMs, setTypingSpeedMs] = useState(DEFAULT_TYPING_SPEED_MS);
  const [typedMessage, setTypedMessage] = useState('');
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState<boolean | null>(null);
  const router = useRouter();

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
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.maintenanceModeEnabled) {
          setIsMaintenanceMode(true);
        } else {
          setWelcomeMessage(data.splashWelcomeMessage || DEFAULT_WELCOME_MESSAGE);
          setSplashImageSrc(data.splashImageUrl || DEFAULT_SPLASH_IMAGE_SRC);
          setTypingSpeedMs(data.typingSpeedMs === undefined ? DEFAULT_TYPING_SPEED_MS : data.typingSpeedMs);
          setIsMaintenanceMode(false);
        }
      } else {
        // Default to non-maintenance mode if doc doesn't exist
        setWelcomeMessage(DEFAULT_WELCOME_MESSAGE);
        setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC);
        setTypingSpeedMs(DEFAULT_TYPING_SPEED_MS);
        setIsMaintenanceMode(false);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching site settings:", error);
      // Fallback to defaults on error
      setIsLoading(false);
      setWelcomeMessage(DEFAULT_WELCOME_MESSAGE);
      setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC);
      setTypingSpeedMs(DEFAULT_TYPING_SPEED_MS);
      setIsMaintenanceMode(false);
    });

    return () => unsubscribe();
  }, []);

  // Typing animation effect
  useEffect(() => {
    if (isLoading || !isImageLoaded) return;
    setTypedMessage(''); // Reset on re-render
    
    let i = 0;
    const timer = setInterval(() => {
      setTypedMessage(TARGET_ANIMATION_MESSAGE.substring(0, i + 1));
      i++;
      if (i >= TARGET_ANIMATION_MESSAGE.length) {
        clearInterval(timer);
      }
    }, typingSpeedMs);

    return () => clearInterval(timer);
  }, [isLoading, isImageLoaded, typingSpeedMs]);
  
  // Image loading effect
  useEffect(() => {
    if (splashImageSrc === DEFAULT_SPLASH_IMAGE_SRC || !splashImageSrc) {
      setIsImageLoaded(true);
    } else {
      setIsImageLoaded(false); // Reset for new images
    }
  }, [splashImageSrc]);

  // Maintenance mode redirect effect
  useEffect(() => {
    if (isMaintenanceMode === true) {
      router.replace('/updates-coming');
    }
  }, [isMaintenanceMode, router]);

  const renderContent = () => {
    if (isLoading || isMaintenanceMode === null) {
      return (
        <Card className="w-full max-w-2xl p-6 text-center shadow-2xl border">
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

    return (
      <Card className="w-full max-w-2xl p-6 space-y-6 text-center shadow-2xl border">
        <CardHeader className="p-0">
          <CardTitle className="text-4xl font-headline text-primary">
            {welcomeMessage}
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
            data-ai-hint="technology abstract welcome"
          />
          <CardDescription className="text-lg">
            Choose your interaction mode to begin.
          </CardDescription>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Button asChild variant="outline" size="lg" className="h-auto py-4 flex flex-col gap-2">
              <Link href="/chat/text-only">
                <MessageSquareText className="h-8 w-8 text-primary" />
                <span className="font-semibold">Text Only</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-auto py-4 flex flex-col gap-2">
              <Link href="/chat/audio-text">
                <Bot className="h-8 w-8 text-primary" />
                <span className="font-semibold">Audio & Text</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-auto py-4 flex flex-col gap-2">
              <Link href="/chat/audio-only">
                <Mic className="h-8 w-8 text-primary" />
                <span className="font-semibold">Audio Only</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center flex-grow p-4">
      {renderContent()}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Press Ctrl + Shift + A to access the admin panel.
      </p>
    </div>
  );
}
