import React from 'react';
import { priorityBadge } from '@/lib/priority';
import { TYPE_COLORS } from './constants';

export const getTypeBadge = (type: string) => {
  const colors = TYPE_COLORS[type as keyof typeof TYPE_COLORS] || TYPE_COLORS.task;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        paddingInline: 6,
        paddingBlock: 2,
        borderRadius: 3,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
      }}
    >
      {type}
    </div>
  );
};

export const getPriorityBadge = (priority?: string) => {
  if (!priority) return null;
  const colors = priorityBadge(priority);
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        paddingInline: 6,
        paddingBlock: 2,
        borderRadius: 3,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        backgroundColor: colors.bg,
        color: colors.text,
      }}
    >
      {priority}
    </div>
  );
};
