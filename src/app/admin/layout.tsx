
import type { ReactNode } from 'react';

// This provides the overall padding and container for the admin section.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="container mx-auto px-4 py-8">{children}</div>;
}
