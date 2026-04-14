import type { Metadata } from 'next';
import {
  Bricolage_Grotesque,
  Cormorant_Garamond,
  IBM_Plex_Mono,
} from 'next/font/google';
import './globals.css';

const bodyFont = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-body',
});

const displayFont = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
});

const monoFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'TikTok Toolkit',
  description:
    'Review TikTok export data, resolve public previews, and generate direct or bulk download workflows from TikTok links and uploaded history.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
