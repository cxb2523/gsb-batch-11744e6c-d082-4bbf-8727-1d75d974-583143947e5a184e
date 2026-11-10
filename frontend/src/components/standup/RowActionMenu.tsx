'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface RowMenuItem {
  /** Stable key for React. */
  key: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  /** Destructive actions (delete/remove) are tinted and sit last. */
  danger?: boolean;
}

/**
 * The single overflow control for a standup row. It replaces the row's inline
 * action icons: one quiet kebab on hover that opens a menu of commands, so long
 * titles are never masked and new actions cost no extra width.
 *
 * It renders the `.su-row-actions` element itself, so it inherits the row's
 * hover/focus reveal — and while the menu is open it forces itself visible
 * (`is-open`) even if the pointer leaves the row.
 */
export function RowActionMenu({ items, label }: { items: RowMenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  // Which way the menu opens. Default down; flip up when the row sits too low for
  // the menu to fit below — otherwise it spills past the viewport and the user
  // can't scroll to it (scrolling closes the menu).
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const anchor = buttonRef.current?.getBoundingClientRect();
    if (anchor) {
      // Rough menu height: ~36px per item (min-height + gap) plus padding.
      const estMenuHeight = items.length * 36 + 8;
      // Use the scroll container's bottom edge so the menu flips before being
      // clipped by overflow-y: auto on .su-col-body, not just the viewport edge.
      const scrollContainer = buttonRef.current?.closest('.su-col-body');
      const containerBottom = scrollContainer
        ? scrollContainer.getBoundingClientRect().bottom
        : window.innerHeight;
      const spaceBelow = containerBottom - anchor.bottom;
      // Flip up only when there isn't room below and there's more room above.
      setOpenUp(spaceBelow < estMenuHeight + 8 && anchor.top > spaceBelow);
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    // A menu anchored to a row must not float away from it once the page scrolls.
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <span ref={ref} className={`su-row-actions${open ? ' is-open' : ''}`}>
      <button
        ref={buttonRef}
        type="button"
        className="su-icon-btn"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation(); // never also open the row
          toggle();
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div className={`su-menu${openUp ? ' su-menu--up' : ''}`} role="menu" onClick={(event) => event.stopPropagation()}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`su-menu-item${item.danger ? ' su-menu-item--danger' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <span className="su-menu-item-icon" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
