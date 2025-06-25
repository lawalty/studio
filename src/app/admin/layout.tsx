
import type { ReactNode } from 'react';

// This layout is now a pass-through component to prevent routing conflicts.
// The container styles have been moved to each individual admin page.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
