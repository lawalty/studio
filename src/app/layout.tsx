
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Blair',
  description: 'Converse with AI Blair, your AI-powered knowledge management expert.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
