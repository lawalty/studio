'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from "@/lib/utils";
import { Mic, MessageSquareText, FileText, DatabaseZap } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const DEFAULT_SPLASH_IMAGE_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const DEFAULT_SPLASH_WELCOME_MESSAGE = "Welcome to AI Chat";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";

export default function StartPage() {
  const [splashImageSrc, setSplashImageSrc] = useState<string>(DEFAULT_SPLASH_IMAGE_SRC);
  const [splashWelcomeMessage, setSplashScreenWelcomeMessage] = useState<string>(DEFAULT_SPLASH_WELCOME_MESSAGE);
  const [isSplashImageLoaded, setIsSplashImageLoaded] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  useEffect(() => {
    const fetchMinimalConfig = async () => {
      setIsLoadingConfig(true);
      try {
        const siteAssetsDocRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
        const siteAssetsDocSnap = await getDoc(siteAssetsDocRef);
        if (siteAssetsDocSnap.exists()) {
          const assets = siteAssetsDocSnap.data();
          setSplashImageSrc(assets.splashImageUrl || DEFAULT_SPLASH_IMAGE_SRC);
          setSplashScreenWelcomeMessage(assets.splashWelcomeMessage || DEFAULT_SPLASH_WELCOME_MESSAGE);
        }
      } catch (e) {
        console.error("Could not load minimal config for start page:", e);
        // Defaults are already set, so we can just proceed
      } finally {
        setIsLoadingConfig(false);
      }
    };
    fetchMinimalConfig();
  }, []);
  
  useEffect(() => {
    if (splashImageSrc !== DEFAULT_SPLASH_IMAGE_SRC) {
      setIsSplashImageLoaded(false);
    } else {
      setIsSplashImageLoaded(true);
    }
  }, [splashImageSrc]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-headline text-primary">
            {isLoadingConfig ? "Connecting..." : splashWelcomeMessage}
          </CardTitle>
          <CardDescription className="text-base">Let&apos;s have a conversation.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-6">
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
          {isLoadingConfig && (
            <div className="flex items-center text-sm text-muted-foreground p-2 border rounded-md bg-secondary/30">
              <DatabaseZap className="mr-2 h-5 w-5 animate-pulse" /> Connecting to settings...
            </div>
          )}
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
        </CardContent>
      </Card>
    </div>
  );
}
