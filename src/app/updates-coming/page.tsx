
'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Cog } from 'lucide-react';
import { cn } from '@/lib/utils';

const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const DEFAULT_SPLASH_IMAGE_SRC = TRANSPARENT_PIXEL;
const DEFAULT_BACKGROUND_IMAGE_SRC = TRANSPARENT_PIXEL;
const DEFAULT_MESSAGE = "Exciting updates are on the way! We'll be back online shortly.";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";

export default function UpdatesComingPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [splashImageSrc, setSplashImageSrc] = useState<string>(DEFAULT_SPLASH_IMAGE_SRC);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string>(DEFAULT_MESSAGE);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPreviewMode = searchParams.get('preview') === 'true';

  useEffect(() => {
    if (isPreviewMode) {
      router.replace('/?preview=true');
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        router.push('/admin');
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    const docRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (!data.maintenanceModeEnabled) {
          router.replace('/');
          return;
        }
        setSplashImageSrc(data.splashImageUrl || DEFAULT_SPLASH_IMAGE_SRC);
        setBackgroundUrl(data.backgroundUrl || null);
        setMessage(data.maintenanceModeMessage || DEFAULT_MESSAGE);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Failed to fetch maintenance mode settings:", error);
      setIsLoading(false);
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      unsubscribe();
    };
  }, [router, isPreviewMode]);

  useEffect(() => {
    if (splashImageSrc === TRANSPARENT_PIXEL || !splashImageSrc) {
      setIsImageLoaded(true);
    } else {
      setIsImageLoaded(false);
    }
  }, [splashImageSrc]);

  if (isLoading || isPreviewMode) {
    return (
        <div className="relative flex flex-col items-center justify-center flex-grow p-4">
            <Card className="w-full max-w-lg p-6 space-y-6 text-center shadow-2xl border bg-card/80 backdrop-blur-sm">
                <CardHeader className="p-0">
                    <div className="flex justify-center items-center gap-3">
                        <Cog className="h-8 w-8 text-primary animate-spin-slow" />
                        <CardTitle className="text-3xl font-headline text-primary">Updates Are Coming!</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="p-0 space-y-6">
                    <Skeleton className="w-full h-[267px] rounded-lg" />
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-3/4 mx-auto" />
                        <Skeleton className="h-4 w-1/2 mx-auto" />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
  }
  
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
      <Card className="w-full max-w-lg p-6 space-y-6 text-center shadow-2xl border bg-card/80 backdrop-blur-sm">
        <CardHeader className="p-0">
          <div className="flex justify-center items-center gap-3">
             <Cog className="h-8 w-8 text-primary animate-spin-slow" />
             <CardTitle className="text-3xl font-headline text-primary">Updates Are Coming!</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0 space-y-6">
          <Image
            src={splashImageSrc}
            alt="Site update splash"
            width={400}
            height={267}
            className={cn(
              "rounded-lg shadow-md object-cover w-full h-auto transition-opacity duration-700 ease-in-out",
              (splashImageSrc !== TRANSPARENT_PIXEL && !isImageLoaded) ? "opacity-0" : "opacity-100"
            )}
            priority
            unoptimized={splashImageSrc.startsWith('data:image/')}
            onLoad={() => setIsImageLoaded(true)}
            onError={() => {
              setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC);
              setIsImageLoaded(true);
            }}
            data-ai-hint={splashImageSrc === DEFAULT_SPLASH_IMAGE_SRC ? undefined : "construction gear"}
          />
          <CardDescription className="text-base text-foreground" data-gramm="false">
            {message.split('\n').map((line, i) => (
              <React.Fragment key={i}>
                {line}
                <br />
              </React.Fragment>
            ))}
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}
