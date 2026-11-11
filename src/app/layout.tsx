/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 */

import type { Metadata } from "next";
import { Geist_Mono, Inter, Inter_Tight } from "next/font/google";
import "./globals.css";

// Inter for reading and controls; Inter Tight, light, for headings; Geist
// Mono for numbers and code. All three are SIL Open Font License.
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Inter_Tight({ subsets: ["latin"], weight: ["300", "400"], variable: "--font-display", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

const description =
  "An audio-reactive orb for voice interfaces, drawn in WebGL2. Play any voice through it, tune it, and take the code. MIT licensed.";

export const metadata: Metadata = {
  title: "Voice orb",
  description,
  openGraph: { title: "Voice orb", description, type: "website" },
  twitter: { card: "summary", title: "Voice orb", description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
