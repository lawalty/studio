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

export default function StartPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [splashImageSrc, setSplashImageSrc] = useState<string>(DEFAULT_SPLASH_IMAGE_SRC);
  const [welcomeMessage, setWelcomeMessage] = useState<string>(DEFAULT_WELCOME_MESSAGE);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState<boolean | null>(null);
  const router = useRouter();

  // Added keydown listener for admin access
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


  useEffect(() => {
    // This event is fired by the Header component in the standard layout,
    // signaling this page should behave as a splash screen.
    const handleSplashScreenActive = () => {
      // Logic for splash screen can go here if needed.
    };
    window.addEventListener('splashScreenActive', handleSplashScreenActive);
    return () => window.removeEventListener('splashScreenActive', handleSplashScreenActive);
  }, []);

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
          setIsMaintenanceMode(false);
        }
      } else {
        // If doc doesn't exist, default to non-maintenance mode
        setWelcomeMessage(DEFAULT_WELCOME_MESSAGE);
        setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC);
        setIsMaintenanceMode(false);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching site settings:", error);
      // Fallback to defaults on error
      setIsLoading(false);
      setWelcomeMessage(DEFAULT_WELCOME_MESSAGE);
      setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC);
      setIsMaintenanceMode(false);
    });

    return () => unsubscribe();
  }, []);
  
  useEffect(() => {
    if (splashImageSrc === DEFAULT_SPLASH_IMAGE_SRC || !splashImageSrc) {
      setIsImageLoaded(true);
    } else {
      setIsImageLoaded(false); // Reset for new images
    }
  }, [splashImageSrc]);

  useEffect(() => {
    if (isMaintenanceMode === true) {
      router.replace('/updates-coming');
    }
  }, [isMaintenanceMode, router]);

  const renderContent = () => {
    if (isLoading || isMaintenanceMode === null) {
      return (
        <Card className="w-full max-w-2xl p-6 text-center shadow-2xl border">
          <CardHeader><Skeleton className="h-8 w-3/4 mx-auto" /></CardHeader>
          <CardContent className="space-y-6">
            <Skeleton className="w-full h-[267px] rounded-lg" />
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
          <CardDescription className="text-lg">
            Choose your interaction mode to begin.
          </CardDescription>
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
       {/* Added admin panel access instruction */}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Press Ctrl + Shift + A to access the admin panel.
      </p>
    </div>
  );
}
