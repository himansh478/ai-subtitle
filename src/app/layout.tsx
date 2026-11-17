import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { MediaErrorHandler } from '@/components/MediaErrorHandler';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cwaya Captions - AI Video Caption Generator',
  description: 'Generate viral word-level synchronized animated captions for Reels, Shorts, and TikTok.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Cwaya Captions',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#0c0d0f',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body>
        <MediaErrorHandler />
        {children}
      </body>
    </html>
  );
}
