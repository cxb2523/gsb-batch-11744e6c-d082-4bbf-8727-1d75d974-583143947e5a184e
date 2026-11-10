import React from 'react';
import { C, statusChipStyle } from './constants';
import { statusVisual } from './helpers';
import { EpicInfo } from './types';

export function EpicRow({ epic, onClick }: { epic: EpicInfo; onClick: () => void }) {
  const pct = Math.min(100, Math.max(0, epic.progress_percentage));
  const sv = statusVisual(epic.status);
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${C.borderSubtle}`,
        cursor: 'pointer',
        transition: 'background-color 0.12s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor = C.pageBg;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <span
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            color: C.muted,
            whiteSpace: 'nowrap',
          }}
        >
          {epic.key}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            color: C.heading,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={epic.title}
        >
          {epic.title}
        </span>
        <span
          style={{
            ...statusChipStyle,
            color: sv.color,
            backgroundColor: sv.bg,
          }}
        >
          {epic.status}
        </span>
        {epic.due_date && (
          <span style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>
            {new Date(epic.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: 6, background: C.borderSubtle, borderRadius: 3, overflow: 'hidden' }}>
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: pct >= 100 ? C.success : C.inProgress,
            }}
          />
        </div>
        <span
          style={{
            fontSize: 12,
            color: C.subtle,
            fontVariantNumeric: 'tabular-nums',
            minWidth: 70,
            textAlign: 'right',
          }}
        >
          {epic.completed_tickets}/{epic.total_tickets}
        </span>
      </div>
    </div>
  );
}
