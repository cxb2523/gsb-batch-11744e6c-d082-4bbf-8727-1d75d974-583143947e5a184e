'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Link2, Search } from 'lucide-react';

import type { ModuleTicket } from '@/lib/api/lifecycle';
import { C, CATEGORY_STYLE, VISUALLY_HIDDEN, space } from './tokens';

interface Props {
  moduleName: string;
  linked: ModuleTicket[];
  disabled: boolean;
  /** Debounced by the caller's screen; this just asks. */
  onSearch: (query: string, signal: AbortSignal) => Promise<ModuleTicket[]>;
  onChange: (ticketIds: number[]) => void;
}

const DEBOUNCE_MS = 300;

/**
 * Which tickets do this module's work.
 *
 * Search is debounced and the in-flight request is cancelled when a newer one
 * starts, so typing does not queue up answers that arrive out of order. The
 * choice is saved once, when the list closes.
 */
export function TicketPicker({ moduleName, linked, disabled, onSearch, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ModuleTicket[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<ModuleTicket[]>([]);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    const before = linked.map((ticket) => ticket.id);
    const after = picked.map((ticket) => ticket.id);
    if (after.length !== before.length || after.some((id, index) => id !== before[index])) onChange(after);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  });

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setFailed(false);
      onSearch(query.trim(), controller.signal)
        .then(setResults)
        .catch((error) => {
          if ((error as Error)?.name !== 'AbortError') setFailed(true);
        });
    }, results === null ? 0 : DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  const start = () => {
    setPicked(linked);
    setQuery('');
    setResults(null);
    setOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  // Updater form: two ticks in quick succession are batched, and reading the
  // captured value would lose the first one.
  const toggle = (ticket: ModuleTicket) =>
    setPicked((current) =>
      current.some((item) => item.id === ticket.id)
        ? current.filter((item) => item.id !== ticket.id)
        : [...current, ticket],
    );

  // What is already linked stays visible even when a search does not match it.
  const shown = results === null
    ? picked
    : [...results, ...picked.filter((ticket) => !results.some((row) => row.id === ticket.id))];

  return (
    <span className="lc-menu-wrap" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`lc-people${linked.length === 0 ? ' is-empty' : ''}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={linked.length ? linked.map((ticket) => `${ticket.key} ${ticket.title}`).join('\n') : 'No tickets linked'}
        aria-label={
          linked.length
            ? `${moduleName} is built in ${linked.length} tickets. Change them`
            : `${moduleName} has no tickets linked. Link some`
        }
        onClick={() => (open ? close() : start())}
      >
        <Link2 size={13} aria-hidden />
        {linked.length === 0 ? 'Link tickets' : `${linked.length} ${linked.length === 1 ? 'ticket' : 'tickets'}`}
      </button>

      {open && (
        <span className="lc-menu lc-menu--wide lc-menu--tickets" role="dialog" aria-label={`Tickets for ${moduleName}`}>
          <span className="lc-menu-search">
            <Search size={14} aria-hidden />
            <label style={VISUALLY_HIDDEN} htmlFor={`tickets-${moduleName}`}>Search tickets</label>
            <input
              ref={searchRef}
              id={`tickets-${moduleName}`}
              value={query}
              placeholder="Search by title or key"
              onChange={(event) => setQuery(event.target.value)}
            />
          </span>

          <span className="lc-menu-list">
            {failed ? (
              <span style={{ display: 'block', padding: space(1.5), fontSize: 13, color: C.danger }}>
                Couldn&apos;t load tickets. Close this and try again.
              </span>
            ) : results === null ? (
              <span style={{ display: 'block', padding: space(1) }}>
                {[0, 1, 2].map((row) => (
                  <span key={row} className="lc-skeleton" style={{ display: 'block', height: 30, marginBottom: 6, borderRadius: 6 }} />
                ))}
              </span>
            ) : shown.length === 0 ? (
              <span style={{ display: 'block', padding: space(1.5), fontSize: 13, color: C.textMuted }}>
                {query.trim() ? `No ticket matches “${query.trim()}”.` : 'This project has no tickets yet.'}
              </span>
            ) : (
              shown.map((ticket) => {
                const on = picked.some((item) => item.id === ticket.id);
                const style = CATEGORY_STYLE[ticket.category];
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    className="lc-menu-item lc-menu-item--ticket"
                    onClick={() => toggle(ticket)}
                  >
                    <span className={`lc-tick${on ? ' is-on' : ''}`} aria-hidden>
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, flexShrink: 0 }}>{ticket.key}</span>
                        <span style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ticket.title}
                        </span>
                      </span>
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        padding: '1px 6px',
                        borderRadius: 999,
                        background: style.bg,
                        color: style.fg,
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      {ticket.status}
                    </span>
                  </button>
                );
              })
            )}
          </span>

          <span className="lc-menu-foot">
            <span style={{ fontSize: 12, color: C.textMuted }}>
              {picked.length === 0 ? 'None linked' : `${picked.length} linked`}
            </span>
            <button type="button" className="lc-btn lc-btn--sm" onClick={close}>Done</button>
          </span>
        </span>
      )}
    </span>
  );
}
