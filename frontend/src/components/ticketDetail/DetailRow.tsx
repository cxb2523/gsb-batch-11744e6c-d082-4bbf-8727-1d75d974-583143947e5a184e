import React from 'react';
import { tokens } from '../../design-system/tokens';

// ===== Details rail primitives =====
//
// The rail used to be ~700 lines of hand-rolled popovers, one per field, each with
// its own open-state, ref and outside-click handler. These four wrap the shared
// Select and keep every row on the same rhythm.

export function DetailRow({
  label,
  children,
  align = 'center',
}: {
  label: string;
  children: React.ReactNode;
  align?: 'center' | 'flex-start';
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '92px 1fr',
        alignItems: align,
        gap: 8,
        minHeight: 34,
        padding: '3px 0',
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: tokens.colors.neutral[600],
          paddingTop: align === 'flex-start' ? 8 : 0,
        }}
      >
        {label}
      </span>
      <div style={{ minWidth: 0, fontSize: 13, color: tokens.colors.neutral[900] }}>{children}</div>
    </div>
  );
}
