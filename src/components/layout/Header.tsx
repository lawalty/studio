
'use client';

import Link from 'next/link';
import { Bot, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function Header() {

  const handleNavigateToSplash = () => {
    window.dispatchEvent(new CustomEvent('navigateToSplashScreen'));
  };

  return (
    <header className="bg-card border-b border-border">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-primary hover:text-accent transition-colors">
          <Bot size={28} />
          <h1 className="text-2xl font-bold font-headline">AI Blair</h1>
        </Link>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleNavigateToSplash} aria-label="Change Interaction Mode">
                <Settings size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Change Interaction Mode</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </header>
  );
}
