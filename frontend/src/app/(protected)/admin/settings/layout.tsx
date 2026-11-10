'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { SettingsTabs } from '../../../../design-system/components';
import { tokens } from '../../../../design-system/tokens';

// Only settings that are genuinely install-wide belong here. Anything that differs
// per project lives under /projects/{id}/settings, and anything per-user under
// /profile.
//
// Permissions used to sit here too, but it only ever rendered a fixed, read-only
// matrix nobody could change, so it has been dropped.
const tabs = [
  { id: 'navigation', label: 'Navigation' },
];

/**
 * Shell for the install-wide settings.
 *
 * The global-admin gate is the /admin layout one level up, which redirects anyone
 * whose role is not "admin" — so every route under /admin is covered, not just an
 * index page.
 */
export default function GlobalSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeId = tabs.find((t) => pathname?.endsWith(`/${t.id}`))?.id ?? tabs[0].id;

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ShieldCheck size={24} color={tokens.colors.neutral[900]} />
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
          Global settings
        </h1>
      </div>

      <SettingsTabs
        items={tabs}
        activeId={activeId}
        onChange={(id) => router.push(`/admin/settings/${id}`)}
      />

      {children}
    </div>
  );
}
