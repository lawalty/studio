import AdminNavLinkCard from '@/components/admin/AdminNavLinkCard';
import { BookOpenText, KeyRound, Smile, Image as ImageIcon } from 'lucide-react'; // Use ImageIcon for avatar

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
        description="Configure API keys for Gemini, TTS, STT, and Voice ID."
        href="/admin/api-keys"
        Icon={KeyRound}
      />
      <AdminNavLinkCard
        title="Persona & Avatar"
        description="Adjust AI Blair's personality, traits, and avatar image."
        href="/admin/persona"
        Icon={Smile}
      />
       {/* Placeholder for a dedicated Avatar page if complex, or keep integrated with Persona */}
       {/* <AdminNavLinkCard
        title="Avatar Management"
        description="Upload and manage AI Blair's avatar image."
        href="/admin/avatar"
        Icon={ImageIcon}
      /> */}
    </div>
  );
}
