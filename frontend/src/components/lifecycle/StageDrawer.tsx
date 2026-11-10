'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

import { C } from './tokens';

interface Props {
  open: boolean;
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * The dock on the right: one stage's whole record, beside the route rather than
 * below it, so the journey stays in view while you read a step.
 *
 * It is a panel, not a modal: the route behind it stays usable, so clicking
 * another station swaps what the dock shows. Escape closes it and focus goes
 * back to where it came from.
 */
export function StageDrawer({ open, title, subtitle, onClose, children }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // A popup inside the dock handles its own Escape first and stops this one.
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      returnTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside ref={panelRef} className="lc-dock" aria-label={`${title} details`}>
      <header className="lc-dock-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: -0.2 }}>{title}</h2>
          {subtitle && <div style={{ marginTop: 3 }}>{subtitle}</div>}
        </div>
        <button type="button" className="lc-icon-btn" aria-label="Close details" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="lc-dock-body">{children}</div>
    </aside>
  );
}
