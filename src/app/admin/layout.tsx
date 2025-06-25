'use client';

import type { ReactNode } from 'react';

// This layout is now a simple "pass-through" to resolve the persistent
// ChunkLoadError. It no longer provides a shared header, but it ensures
// that the admin pages can load reliably.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
