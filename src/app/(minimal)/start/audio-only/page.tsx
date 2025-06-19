
'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Volume2, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const DEFAULT_AVATAR_PLACEHOLDER_URL = "https://placehold.co/150x150.png";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";

function AudioOnlyPageContent() {
  const router = useRouter();
  const [avatarSrc, setAvatarSrc] = useState<string>(DEFAULT_AVATAR_PLACEHOLDER_URL);
  const [isLoadingAvatar, setIsLoadingAvatar] = useState(true);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const { toast } = useToast();

  const requestMicPermission = useCallback(async () => {
    if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      toast({ variant: "destructive", title: "Audio Not Supported", description: "Your browser doesn't support microphone access."});
      setHasMicPermission(false);
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setHasMicPermission(true);
    } catch (error) {
      console.error("Error requesting microphone permission:", error);
      setHasMicPermission(false);
      toast({
        variant: "destructive",
        title: "Microphone Access Denied",
        description: "AI Blair needs microphone access for audio modes. Please enable it in your browser settings and refresh.",
        duration: 7000,
      });
    }
  }, [toast]);

  useEffect(() => {
    requestMicPermission();
  }, [requestMicPermission]);

  useEffect(() => {
    const fetchAvatar = async () => {
      setIsLoadingAvatar(true);
      try {
        const docRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setAvatarSrc(data?.avatarUrl || DEFAULT_AVATAR_PLACEHOLDER_URL);
        } else {
          setAvatarSrc(DEFAULT_AVATAR_PLACEHOLDER_URL);
        }
      } catch (error) {
        console.error("Error fetching avatar:", error);
        setAvatarSrc(DEFAULT_AVATAR_PLACEHOLDER_URL);
      }
      setIsLoadingAvatar(false);
    };
    fetchAvatar();
  }, []);

  const handleStartConversation = () => {
    if (hasMicPermission === false) {
       toast({ variant: "destructive", title: "Microphone Required", description: "Please grant microphone permission to start.", duration: 5000 });
       requestMicPermission(); // Re-trigger permission request
       return;
    }
    router.push('/?embedded=true&mode=audio-only');
  };

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl font-headline text-primary flex items-center justify-center gap-2">
          <Volume2 className="h-8 w-8" /> Audio Only Mode
        </CardTitle>
        <CardDescription>AI Blair will respond with voice only.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-6">
        {isLoadingAvatar ? (
          <div className="w-[150px] h-[150px] bg-muted rounded-full flex items-center justify-center animate-pulse">
            <p className="text-xs text-muted-foreground">Loading Avatar...</p>
          </div>
        ) : (
          <Image
            src={avatarSrc}
            alt="AI Blair Avatar"
            width={150}
            height={150}
            className="rounded-full border-4 border-primary shadow-md object-cover"
            priority
            unoptimized={avatarSrc.startsWith('data:image/') || avatarSrc.startsWith('blob:') || !avatarSrc.startsWith('https://')}
            data-ai-hint={avatarSrc === DEFAULT_AVATAR_PLACEHOLDER_URL || avatarSrc.includes("placehold.co") ? "professional woman" : undefined}
             onError={() => setAvatarSrc(DEFAULT_AVATAR_PLACEHOLDER_URL)}
          />
        )}
        {hasMicPermission === false && (
            <div className={cn("w-full p-3 rounded-md border bg-destructive/10 border-destructive/30 text-destructive text-sm flex items-start gap-2")}>
                <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0"/>
                <span>Microphone access is required for this mode. Please enable it in your browser.</span>
            </div>
        )}
        <Button onClick={handleStartConversation} size="lg" className="w-full" disabled={hasMicPermission === null || isLoadingAvatar}>
          Start Conversation
        </Button>
      </CardContent>
    </Card>
  );
}

export default function StartAudioOnlyPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen w-screen text-lg">Loading interface...</div>}>
      <AudioOnlyPageContent />
    </Suspense>
  );
}
