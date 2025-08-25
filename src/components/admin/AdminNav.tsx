
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Database, KeyRound, Cog, MessageSquare, Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/admin/persona', label: 'AI Persona', Icon: Bot },
  { href: '/admin/knowledge-base', label: 'Knowledge Base', Icon: Database },
  { href: '/admin/api-keys', label: 'API Keys & RAG', Icon: KeyRound },
  { href: '/admin/site-settings', label: 'Site Settings', Icon: Cog },
  { href: '/admin/targeted-chats', label: 'Targeted Chats', Icon: Crosshair },
  { href: '/admin/test-chat', label: 'Test Chat', Icon: MessageSquare },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="mb-8 flex justify-center border-b pb-4">
      <div className="flex items-center gap-2 rounded-lg bg-muted p-1 flex-wrap justify-center">
        {navLinks.map(({ href, label, Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Button
              key={href}
              asChild
              variant={isActive ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'flex items-center gap-2 transition-all',
                isActive && 'shadow-sm'
              )}
            >
              <Link href={href}>
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
