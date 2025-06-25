
'use client';

import AdminNavLinkCard from '@/components/admin/AdminNavLinkCard';
import { BookOpenText, KeyRound, Smile, Settings } from 'lucide-react';

export default function AdminDashboardPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <AdminNavLinkCard
        title="Knowledge Base"
        description="Manage text, PDFs, audio, and other source content for AI Blair."
        href="/admin/knowledge-base"
        Icon={BookOpenText}
      />
      <AdminNavLinkCard
        title="API Keys"
        description="Configure API keys for Gemini, TTS, and Voice ID."
        href="/admin/api-keys"
        Icon={KeyRound}
      />
      <AdminNavLinkCard
        title="Persona & Avatar"
        description="Adjust AI Blair's personality, traits, and avatar image."
        href="/admin/persona"
        Icon={Smile}
      />
      <AdminNavLinkCard
        title="Site Settings"
        description="Manage site-wide settings like the splash screen image."
        href="/admin/site-settings"
        Icon={Settings}
      />
    </div>
  );
}
