
'use client';

import Link from 'next/link';
import { Bot, Undo2 } from 'lucide-react'; // Changed Settings to Undo2
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
                <Undo2 size={20} /> {/* Changed Settings to Undo2 */}
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

