
import type { ReactNode } from 'react';
import { Toaster } from "@/components/ui/toaster"; // Keep toaster for any potential toasts on start pages

// This layout is specifically for the /start/* iframe embed precursor pages.
// It should be extremely minimal, without the main site Header or Footer.
export default function MinimalStartLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background text-foreground flex flex-col min-h-screen">
        <main className="flex-grow container mx-auto px-4 py-8 flex flex-col items-center justify-center">
          {children}
        </main>
        <Toaster />
      </body>
    </html>
  );
}
