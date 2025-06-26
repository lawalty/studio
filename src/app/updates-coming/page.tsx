
'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Cog } from 'lucide-react';
import { cn } from '@/lib/utils';

const DEFAULT_SPLASH_IMAGE_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const DEFAULT_MESSAGE = "Exciting updates are on the way! We'll be back online shortly.";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";

export default function UpdatesComingPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [splashImageSrc, setSplashImageSrc] = useState<string>(DEFAULT_SPLASH_IMAGE_SRC);
  const [message, setMessage] = useState<string>(DEFAULT_MESSAGE);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const docRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSplashImageSrc(data.splashImageUrl || DEFAULT_SPLASH_IMAGE_SRC);
          setMessage(data.maintenanceModeMessage || DEFAULT_MESSAGE);
        }
      } catch (e) {
        console.error("Failed to fetch maintenance mode settings:", e);
        // Use defaults on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);
  
  useEffect(() => {
    if (splashImageSrc !== DEFAULT_SPLASH_IMAGE_SRC) {
      setIsImageLoaded(false);
    } else {
      setIsImageLoaded(true);
    }
  }, [splashImageSrc]);

  return (
    <div className="flex flex-col items-center justify-center flex-grow p-4">
      <Card className="w-full max-w-lg p-6 space-y-6 text-center shadow-2xl border">
        <CardHeader className="p-0">
          <div className="flex justify-center items-center gap-3">
             <Cog className="h-8 w-8 text-primary animate-spin-slow" />
             <CardTitle className="text-3xl font-headline text-primary">Updates Are Coming!</CardTitle>
          </div>
        </CardHeader>

        <CardContent className="p-0 space-y-6">
          {isLoading ? (
            <Skeleton className="w-full h-[267px] rounded-lg" />
          ) : (
            <Image
              src={splashImageSrc}
              alt="Site update splash"
              width={400}
              height={267}
              className={cn(
                "rounded-lg shadow-md object-cover w-full h-auto transition-opacity duration-700 ease-in-out",
                (splashImageSrc !== DEFAULT_SPLASH_IMAGE_SRC && !isImageLoaded) ? "opacity-0" : "opacity-100"
              )}
              priority
              unoptimized={splashImageSrc.startsWith('data:image/')}
              onLoad={() => {
                if (splashImageSrc !== DEFAULT_SPLASH_IMAGE_SRC) setIsImageLoaded(true);
              }}
              onError={() => {
                setSplashImageSrc(DEFAULT_SPLASH_IMAGE_SRC);
                setIsImageLoaded(true);
              }}
              data-ai-hint={(splashImageSrc === DEFAULT_SPLASH_IMAGE_SRC || splashImageSrc.includes("placehold.co")) ? "construction gear" : undefined}
            />
          )}

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto" />
            </div>
          ) : (
            <CardDescription className="text-base text-foreground">
              {message.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  <br />
                </React.Fragment>
              ))}
            </CardDescription>
          )}
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Need to make changes?{' '}
        <Link href="/admin" className="text-accent hover:underline font-semibold">
            Go to Admin Panel
        </Link>
      </p>
    </div>
  );
}
