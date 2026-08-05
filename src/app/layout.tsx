import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nightfall',
  description: 'Voice-based online Mafia with a human Game Master.',
};

/**
 * Deliberately no maximumScale and no userScalable:false. Both would stop iOS
 * zooming when an input is focused, and both do it by taking zoom away from
 * people who need it. The font size fixes the same problem for free — see the
 * touch block in globals.css.
 *
 * viewportFit lets the page reach under the notch, which the safe-area padding
 * then puts back where it belongs.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/*
 * No themeColor here on purpose. It would tint the browser chrome to match the
 * ground, but a meta tag cannot take a var() — it needs a literal hex, and the
 * adherence lint rightly refuses one. A nicety is not worth an exception in the
 * gate that keeps every other value inside the system.
 */

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
