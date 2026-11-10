import type { Metadata } from 'next';
import React from 'react';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '../design-system/theme';
import { GlobalAnimations } from '../components/GlobalAnimations';
import '../app/globals.css';

// `variable` is what makes the loaded face reachable from CSS and inline styles.
// Without it, next/font only exposes a hashed class name, and the ~126 places that
// hardcode `fontFamily: 'var(--font-sans)'` silently fell back to system sans.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'GRID - Project Management',
  description: 'Streamline your workflow with GRID. Collaborate seamlessly, track progress effortlessly, and deliver projects on time. Powered by Stratzi.',
  keywords: ['project management', 'collaboration', 'agile', 'scrum', 'task management'],
  authors: [{ name: 'Stratzi' }],
  creator: 'Stratzi',
  openGraph: {
    title: 'GRID - Project Management',
    description: 'Collaborate seamlessly, track progress effortlessly, and deliver projects on time.',
    type: 'website',
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${inter.className}`}>
      <body>
        <GlobalAnimations />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}


