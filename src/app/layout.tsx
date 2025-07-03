
import type { Metadata } from "next";
import { Inter, Space_Grotesk as SpaceGrotesk } from 'next/font/google'
import { Toaster } from "@/components/ui/toaster"
import { LanguageProvider } from "@/context/LanguageContext";
import ConditionalLayout from "@/components/layout/ConditionalLayout";
import "./globals.css";

const inter = Inter({ 
  subsets: ["latin"],
  variable: '--font-inter',
});

const spaceGrotesk = SpaceGrotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});

export const metadata: Metadata = {
  title: "AI Blair",
  description: "Your AI-powered conversational partner.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${spaceGrotesk.variable}`}>
        <LanguageProvider>
          <ConditionalLayout>
            <main className="flex-grow flex flex-col">
              {children}
            </main>
            <Toaster />
          </ConditionalLayout>
        </LanguageProvider>
      </body>
    </html>
  );
}
