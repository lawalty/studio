
'use client';

import Link from 'next/link';
import { Bot } from 'lucide-react'; // Removed ArrowLeft, Tooltip related imports
// import { Button } from '@/components/ui/button'; // Not needed for simple header
// import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Not needed
import React, { useEffect } from 'react'; // Removed useState

export default function Header() {
  // Removed isSplashScreenCurrentlyActive state and related useEffect/event listeners for rollback simplicity
  // The main page will now always control its own splash screen visibility initially.

  // const handleGoToSplash = () => { // Removed for rollback
  //   window.dispatchEvent(new CustomEvent('forceGoToSplashScreen'));
  // };

  useEffect(() => {
    // This effect is to ensure the page.tsx knows the splash is active on initial load of Header.
    // If page.tsx determines it should not be splash, it will dispatch 'splashScreenInactive'.
    window.dispatchEvent(new CustomEvent('splashScreenActive'));
  }, []);


  return (
    <header className="bg-card border-b border-border">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-primary hover:text-accent transition-colors">
          {/* Removed onClick handler for rollback, Link default behavior is sufficient */}
          <Bot size={28} />
          <h1 className="text-2xl font-bold font-headline">AI Chat</h1>
        </Link>
        
        {/* Removed conditional "Home" button for rollback simplicity. 
            The main page will handle its state. */}
      </div>
    </header>
  );
}
    