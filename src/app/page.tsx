'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from "@/lib/utils";
import { Mic, MessageSquareText, FileText, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Card } from '@/components/ui/card';

const DEFAULT_SPLASH_IMAGE_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const DEFAULT_SPLASH_WELCOME_MESSAGE = "Welcome to AI Chat";
const GREETING_MESSAGE = "Let's have a conversation.";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";

export default function StartPage() {
  const [splashImageSrc, setSplashImageSrc] = useState<string>(DEFAULT_SPLASH_IMAGE_SRC);
  const [splashWelcomeMessage, setSplashScreenWelcomeMessage] = useState<string>(DEFAULT_SPLASH_WELCOME_MESSAGE);
  const [isSplashImageLoaded, setIsSplashImageLoaded] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isClient, setIsClient] = useState(false);
  
  const [showGreeting, setShowGreeting] = useState(false);
  const [animatedGreeting, setAnimatedGreeting] = useState('');

  const router = useRouter();
  
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

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
    const fetchMinimalConfig = async () => {
      setIsLoadingConfig(true);
      try {
        const siteAssetsDocRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
        const siteAssetsDocSnap = await getDoc(siteAssetsDocRef);
        if (siteAssetsDocSnap.exists()) {
          const assets = siteAssetsDocSnap.data();

          if (assets.maintenanceModeEnabled) {
            router.replace('/updates-coming');
            return; // Stop further processing on this page
          }

          setSplashImageSrc(assets.splashImageUrl || DEFAULT_SPLASH_IMAGE_SRC);
          setSplashScreenWelcomeMessage(assets.splashWelcomeMessage || DEFAULT_SPLASH_WELCOME_MESSAGE);
        }
      } catch (e) {
        console.error("Could not load minimal config for start page:", e);
      } finally {
        setIsLoadingConfig(false);
      }
    };
    fetchMinimalConfig();
  }, [router]);
  
  useEffect(() => {
    if (splashImageSrc !== DEFAULT_SPLASH_IMAGE_SRC) {
      setIsSplashImageLoaded(false);
    } else {
      setIsSplashImageLoaded(true);
    }
  }, [splashImageSrc]);

  useEffect(() => {
    if (isLoadingConfig || !isClient) {
      return; 
    }

    // Clear any previous timers and reset the state before starting a new animation cycle
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    setAnimatedGreeting('');
    setShowGreeting(false);

    const initialDelayTimer = setTimeout(() => {
      setShowGreeting(true);
      
      let i = 0;
      const type = () => {
        if (i < GREETING_MESSAGE.length) {
          // Use substring to build the text. This is a more robust way to prevent rendering glitches.
          setAnimatedGreeting(GREETING_MESSAGE.substring(0, i + 1));
          i++;
          const randomDelay = 60 + (Math.random() - 0.5) * 60;
          typingTimerRef.current = setTimeout(type, Math.max(30, randomDelay));
        }
      };
      
      // Kick off the typing animation
      type();

    }, 3000);

    return () => {
      clearTimeout(initialDelayTimer);
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, [isLoadingConfig, isClient]);

  if (isLoadingConfig) {
      return (
        <div className="flex flex-col items-center justify-center flex-grow">
            <Card className="w-full max-w-md p-6 space-y-6 text-center shadow-2xl border flex flex-col items-center">
                 <Loader2 className="h-12 w-12 text-primary animate-spin" />
                 <p className="text-muted-foreground font-semibold">Connecting and checking settings...</p>
            </Card>
        </div>
      );
  }


  return (
    <div className="flex flex-col items-center justify-center flex-grow">
      <Card className="w-full max-w-md p-6 space-y-6 text-center shadow-2xl border">
        <div className="space-y-2">
            <h1 className="text-3xl font-headline text-primary">
                {splashWelcomeMessage}
            </h1>
            <p 
                className={cn(
                "text-base transition-opacity duration-500 min-h-[1.5rem] text-muted-foreground",
                showGreeting ? "opacity-100" : "opacity-0"
                )}
            >
                {isClient && animatedGreeting}
                {isClient && showGreeting && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />}
            </p>
        </div>

        <div className="flex flex-col items-center space-y-6">
            <Image
                src={splashImageSrc}
                alt="AI Chat Splash"
                width={400}
                height={267}
                className={cn(
                "rounded-lg shadow-md object-cover transition-opacity duration-700 ease-in-out",
                (splashImageSrc !== DEFAULT_SPLASH_IMAGE_SRC && !isSplashImageLoaded) ? "opacity-0" : "opacity-100"
                )}
                priority
                unoptimized={splashImageSrc.startsWith('data:image/')}
                onLoad={() => {
                if (splashImageSrc !== DEFAULT_SPLASH_IMAGE_SRC) setIsSplashImageLoaded(true);
                }}
                onError={() => {
                setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC);
                setIsSplashImageLoaded(true);
                }}
                data-ai-hint={(splashImageSrc === DEFAULT_SPLASH_IMAGE_SRC || splashImageSrc.includes("placehold.co")) ? "technology abstract welcome" : undefined}
            />
            <p className="text-base font-semibold text-foreground">Choose your preferred way to interact:</p>
            <div className="w-full space-y-3">
                <Button asChild size="lg" className="w-full" disabled={isLoadingConfig}>
                <Link href="/chat/audio-only">
                    <Mic className="mr-2"/> Audio Only
                </Link>
                </Button>
                <Button asChild size="lg" className="w-full" disabled={isLoadingConfig}>
                <Link href="/chat/audio-text">
                    <MessageSquareText className="mr-2"/> Audio & Text
                </Link>
                </Button>
                <Button asChild size="lg" className="w-full" disabled={isLoadingConfig}>
                <Link href="/chat/text-only">
                    <FileText className="mr-2"/> Text Only
                </Link>
                </Button>
            </div>
        </div>
      </Card>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Press Ctrl + Shift + A to access the admin panel.
      </p>
    </div>
  );
}