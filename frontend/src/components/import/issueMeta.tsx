'use client';

import React from 'react';
import { PRIORITY_LABELS as _PRIORITY_LABELS, PRIORITY_COLOR as _PRIORITY_COLOR } from '../../lib/priority';

/**
 * Shared issue-field chrome (type/priority labels and colours).
 *
 * The type set mirrors ISSUE_TYPES in CreateIssueModal. Priority labels/colours come
 * from the single source of truth (lib/priority), re-exported here for convenience.
 */

export const TYPE_LABELS: Record<string, string> = {
  story: 'Story',
  task: 'Task',
  bug: 'Bug',
  epic: 'Epic',
  subtask: 'Subtask',
};

export const PRIORITY_LABELS: Record<string, string> = _PRIORITY_LABELS;

export const TYPE_META: Record<string, { letter: string; color: string }> = {
  task: { letter: 'T', color: '#0052CC' },
  bug: { letter: 'B', color: '#E34935' },
  story: { letter: 'S', color: '#00875A' },
  epic: { letter: 'E', color: '#6554C0' },
  subtask: { letter: 'S', color: '#4C9AFF' },
};

export const PRIORITY_COLOR: Record<string, string> = _PRIORITY_COLOR;

export function TypeTile({ type, size = 16 }: { type: string | null; size?: number }) {
  const meta = type ? TYPE_META[type] : undefined;
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 3,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.62,
        fontWeight: 700,
        color: '#FFFFFF',
        background: meta?.color ?? '#C1C7D0',
      }}
    >
      {meta?.letter ?? '?'}
    </span>
  );
}

export function PriorityDot({ priority }: { priority: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        borderRadius: 2,
        flexShrink: 0,
        background: PRIORITY_COLOR[priority] ?? '#8993A4',
      }}
    />
  );
}
