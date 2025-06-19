
'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MessageSquareText } from 'lucide-react'; // Using a more specific text icon
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

const DEFAULT_AVATAR_PLACEHOLDER_URL = "https://placehold.co/150x150.png";
const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";

function TextOnlyPageContent() {
  const router = useRouter();
  const [avatarSrc, setAvatarSrc] = useState<string>(DEFAULT_AVATAR_PLACEHOLDER_URL);
  const [isLoadingAvatar, setIsLoadingAvatar] = useState(true);

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
    router.push('/?embedded=true&mode=text-only');
  };

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl font-headline text-primary flex items-center justify-center gap-2">
          <MessageSquareText className="h-8 w-8" /> Text Only Mode
        </CardTitle>
        <CardDescription>Interact with AI Blair using text input and output.</CardDescription>
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
        <Button onClick={handleStartConversation} size="lg" className="w-full" disabled={isLoadingAvatar}>
          Start Conversation
        </Button>
      </CardContent>
    </Card>
  );
}

export default function StartTextOnlyPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen w-screen text-lg">Loading interface...</div>}>
      <TextOnlyPageContent />
    </Suspense>
  );
}
