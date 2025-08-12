
import type { Metadata } from "next";
import { Inter } from 'next/font/google'
import { Toaster } from "@/components/ui/toaster"
import { LanguageProvider } from "@/context/LanguageContext";
import ConditionalLayout from "@/components/layout/ConditionalLayout";
import "./globals.css";

const inter = Inter({ 
  subsets: ["latin"],
  variable: '--font-inter',
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
      <body className={inter.variable}>
        <LanguageProvider>
           <ConditionalLayout>{children}</ConditionalLayout>
           <Toaster />
        </LanguageProvider>
      </body>
    </html>
  );
}
