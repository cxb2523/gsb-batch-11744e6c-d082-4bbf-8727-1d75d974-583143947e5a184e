'use client';

import React, { useEffect, useRef } from 'react';
import { CheckCircle2, Circle, X } from 'lucide-react';

import type { LifecycleModule, ModuleTicket } from '@/lib/api/lifecycle';
import { Avatar } from '@/design-system/components';
import { C, CATEGORY_STYLE, LAYER, RADIUS, space } from './tokens';

interface Props {
  module: LifecycleModule | null;
  onClose: () => void;
}

/** Every item in a module, parents and their subtasks, flattened for counting. */
function allItems(tickets: ModuleTicket[]): ModuleTicket[] {
  return tickets.flatMap((ticket) => [ticket, ...ticket.subtickets]);
}

/**
 * Everything a module is made of: its tickets, the subtasks under them, and how
 * far along it is. Read-only on purpose; the work itself is changed on the board.
 */
export function ModuleDetail({ module, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!module) return;
    requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])');
      const [first, last] = [focusable[0], focusable[focusable.length - 1]];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [module, onClose]);

  if (!module) return null;

  const items = allItems(module.tickets);
  const done = items.filter((item) => item.done).length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: LAYER.popover + 10,
        background: 'rgba(9, 30, 66, 0.54)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: space(2),
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${module.name} work`}
        style={{
          width: 'min(680px, 100%)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: C.surface,
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: space(1.5), padding: `${space(2)}px ${space(2.5)}px`, borderBottom: `1px solid ${C.divider}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text, overflowWrap: 'anywhere' }}>{module.name}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: space(1), marginTop: 6, flexWrap: 'wrap' }}>
              {module.assignees.map((person) => (
                <span key={person.email} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.textSubtle }}>
                  <Avatar name={person.name} size={20} colorful />
                  {person.name}
                </span>
              ))}
              {module.assignees.length === 0 && <span style={{ fontSize: 12, color: C.textMuted }}>Nobody assigned</span>}
            </div>
          </div>
          <button ref={closeRef} type="button" className="lc-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        {items.length > 0 && (
          <div style={{ padding: `${space(2)}px ${space(2.5)}px 0` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.textBody }}>
                {done} of {items.length} done
              </span>
              <span style={{ fontSize: 20, fontWeight: 700, color: percent === 100 ? '#216E4E' : C.text, fontVariantNumeric: 'tabular-nums' }}>
                {percent}%
              </span>
            </div>
            <div className="lc-meter" role="img" aria-label={`${percent} percent done`}>
              <span style={{ ['--lc-fill' as string]: items.length ? done / items.length : 0 }} />
            </div>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: space(2.5) }}>
          {module.tickets.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
              No tickets linked yet. Link some from the module row, and this module will follow them instead of a tick box.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: space(1) }}>
              {module.tickets.map((ticket) => (
                <li key={ticket.id}>
                  <TicketLine ticket={ticket} />
                  {ticket.subtickets.length > 0 && (
                    <ul style={{ listStyle: 'none', margin: `${space(0.5)}px 0 0`, padding: `0 0 0 ${space(3)}px`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {ticket.subtickets.map((subticket) => (
                        <li key={subticket.id}>
                          <TicketLine ticket={subticket} small />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function TicketLine({ ticket, small }: { ticket: ModuleTicket; small?: boolean }) {
  const style = CATEGORY_STYLE[ticket.category];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space(1),
        padding: small ? '5px 8px' : '8px 10px',
        borderRadius: RADIUS.lg,
        background: small ? 'transparent' : C.surfaceSunken,
      }}
    >
      <span aria-hidden style={{ display: 'inline-flex', color: ticket.done ? '#22A06B' : C.textDisabled, flexShrink: 0 }}>
        {ticket.done ? <CheckCircle2 size={small ? 14 : 16} /> : <Circle size={small ? 14 : 16} />}
      </span>
      <span style={{ fontSize: small ? 11 : 12, fontWeight: 700, color: C.textMuted, flexShrink: 0 }}>{ticket.key}</span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: small ? 12.5 : 13.5,
          color: ticket.done ? C.textMuted : C.text,
          textDecoration: ticket.done ? 'line-through' : 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {ticket.title}
      </span>
      <span
        style={{
          flexShrink: 0,
          padding: '1px 7px',
          borderRadius: RADIUS.pill,
          background: style.bg,
          color: style.fg,
          fontSize: 10.5,
          fontWeight: 700,
        }}
      >
        {ticket.status}
      </span>
    </div>
  );
}
