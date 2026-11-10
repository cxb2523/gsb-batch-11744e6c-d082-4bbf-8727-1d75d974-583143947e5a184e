import React from 'react';
import { CalendarDays } from 'lucide-react';
import { C } from './constants';
import { SprintInfo } from './types';

export function SprintRow({ sprint, onClick }: { sprint: SprintInfo; onClick: () => void }) {
  const pct = Math.min(100, Math.max(0, sprint.progress_percentage));
  const daysLabel =
    sprint.days_remaining === null || sprint.days_remaining === undefined
      ? 'No end date'
      : sprint.days_remaining === 0
        ? 'Ends today'
        : sprint.days_remaining === 1
          ? '1 day left'
          : `${sprint.days_remaining} days left`;
  const urgent = sprint.days_remaining !== null && sprint.days_remaining !== undefined && sprint.days_remaining <= 2;

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: C.heading,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sprint.name}
          </div>
          <div style={{ marginTop: 2, fontSize: 12, color: C.muted }}>
            {sprint.project_key || sprint.project_name} · {sprint.my_tickets} assigned to you
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            color: urgent ? C.warning : C.subtle,
            fontWeight: urgent ? 600 : 400,
            whiteSpace: 'nowrap',
          }}
        >
          <CalendarDays size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
          {daysLabel}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            flex: 1,
            height: 6,
            background: C.borderSubtle,
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: pct >= 100 ? C.success : C.inProgress,
              transition: 'width 0.2s ease',
            }}
          />
        </div>
        <span
          style={{
            fontSize: 12,
            color: C.subtle,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            minWidth: 90,
            textAlign: 'right',
          }}
        >
          {sprint.completed_tickets}/{sprint.total_tickets} · {pct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
