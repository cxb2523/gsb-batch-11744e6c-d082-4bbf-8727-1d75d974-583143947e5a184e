import React from 'react';
import { statusChipStyle, type StatusCategory } from '../../lib/statusVisual';

export interface StatusPillProps {
  /** The real status name, always shown as the label. */
  name?: string | null;
  /** Configured hex colour of the status (the source of truth for the chip colour). */
  color?: string | null;
  /** Derived category; used as a fallback palette when no colour is available. */
  category?: StatusCategory | string | null;
  /** Hide the leading dot (e.g. in very dense rows). */
  hideDot?: boolean;
  style?: React.CSSProperties;
}

/**
 * Canonical status chip. Colours come from `statusChipStyle` so every surface paints a
 * status identically from its configured colour. Distinct from the standup-specific pill
 * (`components/standup/StatusPill.tsx`), which deliberately colours by category.
 */
export const StatusPill: React.FC<StatusPillProps> = ({ name, color, category, hideDot, style }) => {
  if (!name) return null;
  const s = statusChipStyle({ color, name, category });

  return (
    <span
      title={name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        maxWidth: 160,
        ...style,
      }}
    >
      {!hideDot && (
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
    </span>
  );
};
