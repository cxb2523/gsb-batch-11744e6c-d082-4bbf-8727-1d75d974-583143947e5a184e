import React from 'react';
import { StatusPill } from '@/design-system/components/StatusPill';
import { C, statusChipStyle } from './constants';
import { priorityVisual, daysUntil } from './helpers';
import { SummaryTicket } from './types';

export function TicketRow({
  ticket,
  onClick,
  rightSlot,
  highlightDue,
}: {
  ticket: SummaryTicket;
  onClick: () => void;
  rightSlot?: React.ReactNode;
  highlightDue?: 'overdue' | 'today' | 'soon' | null;
}) {
  const pv = priorityVisual(ticket.priority);
  const due = ticket.due_date;
  const dueDays = daysUntil(due);

  let dueChip: { label: string; color: string; bg: string } | null = null;
  if (due) {
    if (highlightDue === 'overdue' || (dueDays !== null && dueDays < 0)) {
      const absDays = Math.abs(dueDays ?? 0);
      dueChip = { label: `${absDays}d overdue`, color: C.danger, bg: C.dangerBg };
    } else if (highlightDue === 'today' || dueDays === 0) {
      dueChip = { label: 'Due today', color: C.warning, bg: C.warningBg };
    } else if (dueDays !== null && dueDays > 0 && dueDays <= 3) {
      dueChip = { label: `${dueDays}d left`, color: C.warning, bg: C.warningBg };
    } else if (due) {
      dueChip = {
        label: new Date(due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        color: C.subtle,
        bg: C.pageBg,
      };
    }
  }

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
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
      <span
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          color: C.muted,
          width: 96,
          flexShrink: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {ticket.key}
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
        title={ticket.title}
      >
        {ticket.title}
      </span>
      {/* Project — fixed slot, blank when none so columns stay aligned */}
      <div
        style={{
          width: 64,
          flexShrink: 0,
          fontSize: 12,
          color: C.muted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {ticket.project_key || ''}
      </div>
      {/* Status — fixed slot */}
      <div style={{ width: 140, flexShrink: 0, display: 'flex', overflow: 'hidden' }}>
        <StatusPill name={ticket.status} color={ticket.status_color} category={ticket.status_category} style={{ maxWidth: '100%' }} />
      </div>
      {/* Priority — fixed slot, blank when none */}
      <div
        style={{
          width: 56,
          flexShrink: 0,
          fontSize: 11,
          fontWeight: 600,
          color: pv ? pv.color : 'transparent',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {pv ? pv.label : ''}
      </div>
      {/* Due — fixed slot, blank when none */}
      <div style={{ width: 96, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
        {dueChip && (
          <span
            style={{
              ...statusChipStyle,
              color: dueChip.color,
              backgroundColor: dueChip.bg,
              minWidth: 'auto',
            }}
          >
            {dueChip.label}
          </span>
        )}
      </div>
      {rightSlot}
    </div>
  );
}
