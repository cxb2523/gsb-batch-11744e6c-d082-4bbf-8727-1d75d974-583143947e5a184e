'use client';

import { useEffect, useRef } from 'react';

export interface StandupShortcuts {
  nextPerson: () => void;
  prevPerson: () => void;
  prevDate: () => void;
  nextDate: () => void;
  togglePresent: () => void;
  exitPresent: () => void;
  toggleHelp: () => void;
  /** Add the focused yesterday or blocker ticket to today. */
  pinFocused: (ticketId: number, section: string) => void;
  /** Remove the focused ticket from its column. */
  removeFocused: (ticketId: number, section: string) => void;
  /** Move the focused ticket between Yesterday and Today. */
  moveFocused: (ticketId: number, section: string) => void;
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
}

/** Rows in reading order within the visible person panel. */
function panelRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.su-panel [data-standup-row]'));
}

function focusedRow(): HTMLElement | null {
  const active = document.activeElement as HTMLElement | null;
  return active?.closest<HTMLElement>('[data-standup-row]') ?? null;
}

/**
 * Standup shortcuts. Disabled while `enabled` is false (a modal or popover is open),
 * and never fires while the user is typing or holding a modifier — the same guard
 * the ticket modal uses, so shortcuts don't hijack text entry.
 */
export function useStandupKeyboard(enabled: boolean, shortcuts: StandupShortcuts) {
  const latest = useRef(shortcuts);
  latest.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const actions = latest.current;
      const row = focusedRow();

      switch (event.key) {
        case 'j':
        case 'ArrowRight':
          event.preventDefault();
          actions.nextPerson();
          return;
        case 'k':
        case 'ArrowLeft':
          event.preventDefault();
          actions.prevPerson();
          return;
        case 'ArrowDown':
        case 'ArrowUp': {
          const rows = panelRows();
          if (!rows.length) return;
          event.preventDefault();
          const index = row ? rows.indexOf(row) : -1;
          const next = event.key === 'ArrowDown' ? Math.min(rows.length - 1, index + 1) : Math.max(0, index - 1);
          rows[next]?.focus();
          return;
        }
        case '[':
          event.preventDefault();
          actions.prevDate();
          return;
        case ']':
          event.preventDefault();
          actions.nextDate();
          return;
        case 'P':
          if (event.shiftKey) {
            event.preventDefault();
            actions.togglePresent();
          }
          return;
        case 'Escape':
          actions.exitPresent();
          return;
        case '?':
          event.preventDefault();
          actions.toggleHelp();
          return;
        case 't':
        case 'x':
        case 'm': {
          if (!row) return;
          const ticketId = Number(row.dataset.ticketId);
          const section = row.dataset.section ?? '';
          if (!ticketId) return;
          event.preventDefault();
          if (event.key === 't') actions.pinFocused(ticketId, section);
          else if (event.key === 'm') actions.moveFocused(ticketId, section);
          else actions.removeFocused(ticketId, section);
          return;
        }
        default:
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['J', '→'], label: 'Next person' },
  { keys: ['K', '←'], label: 'Previous person' },
  { keys: ['↓', '↑'], label: 'Move between tickets' },
  { keys: ['Enter'], label: 'Open ticket' },
  { keys: ['T'], label: 'Add focused ticket to today' },
  { keys: ['X'], label: 'Remove focused ticket' },
  { keys: ['M'], label: 'Move focused ticket between Yesterday and Today' },
  { keys: ['[', ']'], label: 'Previous or next working day' },
  { keys: ['Shift', 'P'], label: 'Start or stop presenting' },
  { keys: ['Esc'], label: 'Stop presenting' },
  { keys: ['?'], label: 'Show shortcuts' },
];
