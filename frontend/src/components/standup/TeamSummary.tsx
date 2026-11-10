'use client';

import React from 'react';
import type { StandupBoard } from '@/lib/api/standup';
import { C, RADIUS } from './tokens';

export type RailFilter = 'all' | 'blocked' | 'no_update';

interface Props {
  summary: StandupBoard['summary'];
  filter: RailFilter;
  onFilter: (filter: RailFilter) => void;
}

/** Team totals. The two that need attention double as filters for the people list. */
export function TeamSummary({ summary, filter, onFilter }: Props) {
  const stats: { label: string; value: number; filterKey?: RailFilter; tone?: string }[] = [
    { label: 'Updated', value: summary.updated },
    { label: 'Completed', value: summary.completed },
    { label: 'Planned today', value: summary.planned_today },
    { label: 'Blockers', value: summary.blockers, filterKey: 'blocked', tone: C.danger },
    { label: 'No update', value: summary.no_update, filterKey: 'no_update', tone: C.warning },
  ];

  return (
    <div role="group" aria-label="Team summary" style={{ display: 'flex', alignItems: 'stretch', gap: 4, flexWrap: 'wrap' }}>
      {stats.map((stat) => {
        const active = stat.filterKey && filter === stat.filterKey;
        const content = (
          <>
            <span style={{ fontSize: 16, fontWeight: 600, color: stat.value && stat.tone ? stat.tone : C.text, fontVariantNumeric: 'tabular-nums' }}>
              {stat.value}
            </span>
            <span style={{ fontSize: 12, color: C.textMuted, whiteSpace: 'nowrap' }}>{stat.label}</span>
          </>
        );
        const base: React.CSSProperties = {
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          minHeight: 40,
          padding: '0 12px',
          borderRadius: RADIUS.md,
        };
        if (!stat.filterKey) {
          return <div key={stat.label} style={{ ...base, alignItems: 'center' }}>{content}</div>;
        }
        return (
          <button
            key={stat.label}
            type="button"
            className="su-stat-btn"
            aria-pressed={Boolean(active)}
            title={active ? 'Show everyone' : `Show only people with ${stat.label.toLowerCase()}`}
            disabled={!stat.value && !active}
            onClick={() => onFilter(active ? 'all' : stat.filterKey!)}
            style={{ ...base, alignItems: 'center', background: active ? C.accentSoft : 'transparent', border: `1px solid ${active ? C.accentSoftBorder : 'transparent'}` }}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
