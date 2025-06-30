'use client';

import {
  Bot,
  Database,
  KeyRound,
  Cog,
} from 'lucide-react';
import AdminNavLinkCard from '@/components/admin/AdminNavLinkCard';

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold font-headline tracking-tight text-primary">
          Admin Console
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Configure and manage all aspects of your AI application from here.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AdminNavLinkCard
          href="/admin/persona"
          title="AI Persona & Main Settings"
          description="Define AI Blair's conversational style, traits, avatars, and other core interaction settings."
          Icon={Bot}
        />
        <AdminNavLinkCard
          href="/admin/knowledge-base"
          title="Knowledge Base"
          description="Upload, manage, and process documents to form the AI's knowledge."
          Icon={Database}
        />
        <AdminNavLinkCard
          href="/admin/api-keys"
          title="API Keys & Services"
          description="Manage third-party API keys for services like Twilio SMS and custom TTS."
          Icon={KeyRound}
        />
        <AdminNavLinkCard
          href="/admin/site-settings"
          title="Site & Display Settings"
          description="Adjust the site's splash screen, welcome message, and animation settings."
          Icon={Cog}
        />
      </div>
    </div>
  );
}
