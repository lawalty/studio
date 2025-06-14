
'use client';

import Link from 'next/link';
import { Bot, ArrowLeft } from 'lucide-react'; // Changed Undo2 to ArrowLeft
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

    // Check initial state from page.tsx immediately if possible
    // For now, relying on event dispatch from page.tsx
    const initialSplashStateEvent = new CustomEvent('requestInitialSplashState');
    window.dispatchEvent(initialSplashStateEvent);


    window.addEventListener('splashScreenActive', handleSplashScreenActive);
    window.addEventListener('splashScreenInactive', handleSplashScreenInactive);
    
    return () => {
      window.removeEventListener('splashScreenActive', handleSplashScreenActive);
      window.removeEventListener('splashScreenInactive', handleSplashScreenInactive);
    };
  }, []);

  const handleGoToSplash = () => {
    // This event will be caught by page.tsx to end any active chat and show the splash screen
    window.dispatchEvent(new CustomEvent('forceGoToSplashScreen'));
  };

  return (
    <header className="bg-card border-b border-border">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-primary hover:text-accent transition-colors" onClick={(e) => {
          // If not on splash screen, clicking logo should also go to splash
          if (!isSplashScreenCurrentlyActive) {
            e.preventDefault(); // Prevent default Link navigation
            handleGoToSplash(); // Use our custom logic
          }
        }}>
          <Bot size={28} />
          <h1 className="text-2xl font-bold font-headline">AI Chat</h1>
        </Link>
        
        {!isSplashScreenCurrentlyActive && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" onClick={handleGoToSplash} aria-label="Go Home and Change Mode">
                  <ArrowLeft size={20} />
                  <span className="ml-2">Home</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Go Home / Change Mode</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </header>
  );
}
