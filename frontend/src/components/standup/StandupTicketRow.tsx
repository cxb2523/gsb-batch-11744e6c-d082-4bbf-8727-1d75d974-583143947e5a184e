'use client';

import React from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, ArrowRight, CornerDownRight, Undo2, X } from 'lucide-react';
import type { StandupTicketRow as Row } from '@/lib/api/standup';
import { TypeTile } from '@/components/import/issueMeta';
import { RowActionMenu, type RowMenuItem } from './RowActionMenu';
import { StatusPill } from './StatusPill';
import { C, FONT_MONO } from './tokens';

export type RowVariant = 'yesterday' | 'today' | 'blocker';

export interface RowActions {
  /** Yesterday and blocker rows: add the ticket to today. */
  onTogglePin?: (row: Row) => void;
  /** Every row can be removed from its column for the day. */
  onRemoveToday?: (row: Row) => void;
  onRemoveYesterday?: (row: Row) => void;
  onRemoveBlocker?: (row: Row) => void;
  /** Today rows: pin to (or un-pin from) the next working day. */
  onCarryForward?: (row: Row) => void;
  /** Short name of the day carry forward lands on, e.g. "Mon". */
  carryForwardLabel?: string;
  /** Past standups are read-only. */
  readOnly?: boolean;
}

interface Props {
  row: Row;
  variant: RowVariant;
  onOpen: (row: Row) => void;
  actions?: RowActions;
  /** Ticket ids already on this person's today, so "pin" is not offered twice. */
  plannedIds?: Set<number>;
  /** Set when the same ticket is in both Yesterday and Today. */
  link?: LinkState;
  /** The standup's own date (YYYY-MM-DD, IST). Never the viewer's clock. */
  todayDate: string;
  /** Present when the card can be dragged to the other column. */
  drag?: DragHandlers;
}

export interface DragHandlers {
  /** This card is the one being dragged. */
  active: boolean;
  onStart: () => void;
  onEnd: () => void;
}

const META_TEXT: React.CSSProperties = { fontSize: 12, lineHeight: '16px', color: C.textSubtle, whiteSpace: 'nowrap' };

export interface LinkState {
  /** 'yesterday' rows point forward to today; 'today' rows point back. */
  side: 'yesterday' | 'today';
  /** This pair's own colour; no two pairs on a board share one. */
  color: { bg: string; ring: string };
  highlighted: boolean;
  onHover: (on: boolean) => void;
}

/** Says that the same work is in both columns, and which way it runs. */
export function LinkMarker({ side }: { side: 'yesterday' | 'today' }) {
  const forward = side === 'yesterday';
  return (
    <span
      style={{ ...META_TEXT, color: C.textBody, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
      title={forward ? 'Still on today\u2019s plan' : 'Carried on from yesterday'}
    >
      {forward ? <><ArrowRight size={11} aria-hidden /> Continues today</> : <><ArrowLeft size={11} aria-hidden /> From yesterday</>}
    </span>
  );
}

/**
 * One ticket in a standup column. The title leads; the second line carries the
 * status, key, due date and the one or two flags that matter for planning.
 */
export function StandupTicketRow({ row, variant, onOpen, actions, plannedIds, link, todayDate, drag }: Props) {
  const editable = Boolean(actions && !actions.readOnly);
  // Today's own rows are already planned; elsewhere offer "add to today" unless it's there.
  const showAddToday = editable && actions?.onTogglePin && variant !== 'today' && !plannedIds?.has(row.id);
  const onRemove = { today: actions?.onRemoveToday, yesterday: actions?.onRemoveYesterday, blocker: actions?.onRemoveBlocker }[variant];
  const showRemove = editable && Boolean(onRemove);
  const showCarry = editable && actions?.onCarryForward && variant === 'today';
  const carryDay = actions?.carryForwardLabel ?? 'next day';

  const menuItems: RowMenuItem[] = [];
  if (showAddToday) {
    menuItems.push({ key: 'add-today', label: 'Add to today', icon: <ArrowRight size={16} />, onSelect: () => actions!.onTogglePin!(row) });
  }
  if (showCarry) {
    menuItems.push(
      row.carried_forward
        ? { key: 'carry', label: `Don't carry to ${carryDay}`, icon: <Undo2 size={16} />, onSelect: () => actions!.onCarryForward!(row) }
        : { key: 'carry', label: `Carry to ${carryDay}`, icon: <ArrowRight size={16} />, onSelect: () => actions!.onCarryForward!(row) },
    );
  }
  if (showRemove) {
    const where = variant === 'blocker' ? 'blockers' : variant;
    menuItems.push({ key: 'remove', label: `Remove from ${where}`, icon: <X size={16} />, onSelect: () => onRemove!(row), danger: true });
  }
  const hasActions = menuItems.length > 0;

  let due: React.ReactNode = null;
  if (row.due_date && row.status?.category !== 'done') {
    const dueDate = parseISO(row.due_date);
    const label = format(dueDate, 'd MMM');
    const title = `Due ${format(dueDate, 'd MMM yyyy')}`;
    if (row.is_overdue) {
      due = <span style={{ ...META_TEXT, color: C.danger, fontWeight: 600 }} title={title}>Overdue · {label}</span>;
    } else if (row.due_date === todayDate) {
      due = <span style={{ ...META_TEXT, color: C.warning, fontWeight: 600 }} title={title}>Due today</span>;
    } else {
      due = <span style={META_TEXT} title={title}>Due {label}</span>;
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-standup-row
      data-ticket-id={row.id}
      data-section={variant}
      className={`su-row${hasActions ? ' su-row--actions' : ''}${link ? ' su-row--linked' : ''}${drag?.active ? ' su-row--dragging' : ''}`}
      style={
        link
          ? ({
              background: link.color.bg,
              '--su-row-bg': link.color.bg,
              boxShadow: link.highlighted ? `0 0 0 2px ${link.color.ring}` : undefined,
            } as React.CSSProperties)
          : undefined
      }
      draggable={Boolean(drag)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', row.key); // some browsers won't start a drag without data
        drag?.onStart();
      }}
      onDragEnd={() => drag?.onEnd()}
      onMouseEnter={() => link?.onHover(true)}
      onMouseLeave={() => link?.onHover(false)}
      onFocus={() => link?.onHover(true)}
      onBlur={() => link?.onHover(false)}
      aria-label={`${row.key} ${row.title}${row.status ? `, ${row.status.name}` : ''}`}
      onClick={() => onOpen(row)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(row);
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
        <span style={{ display: 'inline-flex', marginTop: 2, flexShrink: 0 }}>
          <TypeTile type={row.type} size={16} />
        </span>
        <span
          title={row.title}
          className="su-row-title"
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            lineHeight: '20px',
            color: C.text,
            fontWeight: 500,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflowWrap: 'anywhere',
          }}
        >
          {row.title}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, marginTop: 4, paddingLeft: 24 }}>
        <StatusPill status={row.status} />
        <span style={{ ...META_TEXT, fontFamily: FONT_MONO, color: C.textMuted, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {row.key}
        </span>
        {link && <LinkMarker side={link.side} />}
        {due}
        {/* The link marker already says it came from yesterday. */}
        {variant !== 'yesterday' && row.carried_from_date && !link && (
          <span style={{ ...META_TEXT, color: C.textMuted, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CornerDownRight size={11} aria-hidden /> Carried over
          </span>
        )}
        {variant === 'today' && row.carried_forward && (
          <span style={{ ...META_TEXT, color: C.accent, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowRight size={11} aria-hidden /> Carried to {carryDay}
          </span>
        )}
      </div>

      {hasActions && <RowActionMenu items={menuItems} label={`Actions for ${row.key}`} />}
    </div>
  );
}
