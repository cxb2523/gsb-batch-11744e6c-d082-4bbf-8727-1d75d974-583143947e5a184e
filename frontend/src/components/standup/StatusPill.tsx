'use client';

import React from 'react';
import type { StandupStatus } from '@/lib/api/standup';
import { statusChipStyle } from '@/lib/statusVisual';
import { RADIUS } from './tokens';

/**
 * Status as a badge. Colour comes from the status's configured colour (via the
 * shared `statusChipStyle`), falling back to its category only when no colour is
 * set — so standup paints a status the same way the board and the rest of the app do.
 */
export function StatusPill({ status }: { status: StandupStatus | null }) {
  if (!status) return null;
  const s = statusChipStyle({ color: status.color, name: status.name, category: status.category });
  return (
    <span
      title={status.name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 20,
        padding: '0 8px',
        borderRadius: RADIUS.sm,
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        whiteSpace: 'nowrap',
        maxWidth: 120,
        flexShrink: 0,
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{status.name}</span>
    </span>
  );
}
