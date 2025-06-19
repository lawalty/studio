// Minimal layout for /start/* to avoid build errors during rollback
import type { ReactNode } from 'react';

export default function MinimalLayoutPlaceholder({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Placeholder</title>
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
