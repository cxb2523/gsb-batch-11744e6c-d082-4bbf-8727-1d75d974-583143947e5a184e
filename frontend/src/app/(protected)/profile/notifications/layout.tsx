'use client';

import React from 'react';
import Link from 'next/link';
import { Bell, ChevronLeft } from 'lucide-react';
import { tokens } from '../../../../design-system/tokens';

/**
 * Notification preferences are per-user, not per-project, so they sit under the
 * profile rather than in a project's settings, where they used to be.
 *
 * The page itself was written to render inside the old settings shell, so the
 * heading and page padding it relied on live here.
 */
export default function NotificationPreferencesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        paddingInline: 180,
        paddingBlock: 24,
        fontFamily: tokens.fontFamily.sans,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link
          href="/profile"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            textDecoration: 'none',
            fontSize: 14,
            color: tokens.colors.semantic.text.secondary,
            width: 'fit-content',
          }}
        >
          <ChevronLeft size={16} />
          Back to profile
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Bell size={24} color={tokens.colors.neutral[900]} />
          <h1
            style={{
              fontSize: tokens.typography.styles.h1.fontSize,
              lineHeight: `${tokens.typography.styles.h1.lineHeight}px`,
              fontWeight: tokens.typography.styles.h1.fontWeight,
              letterSpacing: tokens.typography.styles.h1.letterSpacing,
              color: tokens.colors.neutral[900],
              margin: 0,
            }}
          >
            Notification preferences
          </h1>
        </div>
      </div>

      {children}
    </div>
  );
}
