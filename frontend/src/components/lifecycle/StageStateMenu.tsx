'use client';

import React, { useEffect, useRef } from 'react';
import { Check, ChevronDown } from 'lucide-react';

import type { StageState } from '@/lib/api/lifecycle';
import { STATE_ORDER, STATE_STYLE } from './tokens';

interface Props {
  /** For the accessible name, so a screen reader hears which stage is being moved. */
  stageName: string;
  state: StageState;
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (state: StageState) => void;
}

/**
 * The state chip on a station card, turned into the control that changes it.
 *
 * Moving a stage is the thing people come to this page to do, so it happens on
 * the card itself: one click to open, one to move, no trip to the panel below.
 */
export function StageStateMenu({ stageName, state, open, disabled, onOpenChange, onPick }: Props) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const style = STATE_STYLE[state];

  // Close on a click elsewhere or on Escape, and hand focus back to the chip.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => optionsRef.current[STATE_ORDER.indexOf(state)]?.focus());
  }, [open, state]);

  const moveFocus = (from: number, delta: number) => {
    const next = (from + delta + STATE_ORDER.length) % STATE_ORDER.length;
    optionsRef.current[next]?.focus();
  };

  return (
    <span className="lc-menu-wrap" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="lc-state-trigger"
        style={{ background: style.bg, color: style.fg }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${stageName} is ${style.label}. Change it`}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            onOpenChange(true);
          }
        }}
      >
        <span className="lc-state-swatch" style={{ background: style.dot }} aria-hidden />
        {style.label}
        <ChevronDown size={12} aria-hidden style={{ opacity: 0.7 }} />
      </button>

      {open && (
        <span className="lc-menu" role="menu" aria-label={`Move ${stageName} to`}>
          {STATE_ORDER.map((option, index) => {
            const optionStyle = STATE_STYLE[option];
            const active = option === state;
            return (
              <button
                key={option}
                ref={(element) => {
                  optionsRef.current[index] = element;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className="lc-menu-item"
                onClick={() => {
                  onOpenChange(false);
                  if (!active) onPick(option);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    moveFocus(index, 1);
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    moveFocus(index, -1);
                  }
                }}
              >
                <span className="lc-state-swatch" style={{ background: optionStyle.dot }} aria-hidden />
                <span style={{ flex: 1 }}>{optionStyle.label}</span>
                {active && <Check size={13} strokeWidth={3} aria-hidden />}
              </button>
            );
          })}
        </span>
      )}
    </span>
  );
}
