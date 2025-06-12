
'use client';

import Link from 'next/link';
import { Bot, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import React, { useState, useEffect } from 'react';

export default function Header() {
  const [isSplashScreenCurrentlyActive, setIsSplashScreenCurrentlyActive] = useState(true);

  useEffect(() => {
    const handleSplashScreenActive = () => setIsSplashScreenCurrentlyActive(true);
    const handleSplashScreenInactive = () => setIsSplashScreenCurrentlyActive(false);

    window.addEventListener('splashScreenActive', handleSplashScreenActive);
    window.addEventListener('splashScreenInactive', handleSplashScreenInactive);

    // Initial dispatch from page.tsx should set this correctly soon after mount.
    // If page.tsx starts with showSplashScreen = true, it will dispatch 'splashScreenActive'.
    
    return () => {
      window.removeEventListener('splashScreenActive', handleSplashScreenActive);
      window.removeEventListener('splashScreenInactive', handleSplashScreenInactive);
    };
  }, []);

  const handleNavigateToSplash = () => {
    window.dispatchEvent(new CustomEvent('navigateToSplashScreen'));
  };

  return (
    <header className="bg-card border-b border-border">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-primary hover:text-accent transition-colors">
          <Bot size={28} />
          <h1 className="text-2xl font-bold font-headline">AI Chat</h1>
        </Link>
        
        {!isSplashScreenCurrentlyActive && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleNavigateToSplash} aria-label="Change Interaction Mode">
                  <Undo2 size={20} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Change Interaction Mode</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </header>
  );
}

