'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isSameDay,
  isSameMonth,
  isWeekend,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { C, LAYER, RADIUS, SHADOW, space } from './tokens';

interface Props {
  date: string;       // YYYY-MM-DD, the standup being viewed
  today: string;      // YYYY-MM-DD in IST, from the server
  prevDate: string;
  nextDate: string | null;
  onChange: (date: string) => void;
}

const iso = (day: Date) => format(day, 'yyyy-MM-dd');

export function DateNavigator({ date, today, prevDate, nextDate, onChange }: Props) {
  const selected = parseISO(date);
  const todayDate = parseISO(today);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(startOfMonth(selected));
  const [focused, setFocused] = useState(selected);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setMonth(startOfMonth(selected));
    setFocused(selected);
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${iso(focused)}"]`)?.focus();
  }, [open, focused]);

  const pick = (day: Date) => {
    if (isAfter(day, todayDate)) return;
    setOpen(false);
    onChange(iso(day));
  };

  const moveFocus = (delta: number) => {
    const next = addDays(focused, delta);
    if (isAfter(next, todayDate)) return;
    setFocused(next);
    if (!isSameMonth(next, month)) setMonth(startOfMonth(next));
  };

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });

  const isToday = date === today;

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
      <button type="button" className="su-icon-btn su-icon-btn--bordered" aria-label="Previous working day" title="Previous working day ( [ )" onClick={() => onChange(prevDate)}>
        <ChevronLeft size={18} />
      </button>

      <button
        type="button"
        className="su-date-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Standup date ${format(selected, 'EEEE, d MMM yyyy')}. Change date`}
        onClick={() => setOpen((value) => !value)}
      >
        <CalendarDays size={16} aria-hidden color={C.textSubtle} />
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{format(selected, 'EEE, d MMM yyyy')}</span>
      </button>

      <button
        type="button"
        className="su-icon-btn su-icon-btn--bordered"
        aria-label="Next working day"
        title={nextDate ? 'Next working day ( ] )' : 'You are on the latest standup'}
        disabled={!nextDate}
        onClick={() => nextDate && onChange(nextDate)}
      >
        <ChevronRight size={18} />
      </button>

      {!isToday && (
        <button type="button" className="su-link-btn" onClick={() => onChange(today)} style={{ marginLeft: 4 }}>
          Back to today
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Choose standup date"
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          }}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: LAYER.popover,
            width: 296,
            padding: space(2),
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: RADIUS.lg,
            boxShadow: SHADOW.overlay,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(1) }}>
            <button type="button" className="su-icon-btn" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }} aria-live="polite">{format(month, 'MMMM yyyy')}</span>
            <button
              type="button"
              className="su-icon-btn"
              aria-label="Next month"
              disabled={!isAfter(startOfMonth(todayDate), month)}
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div role="grid" ref={gridRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) => (
              <div key={label} role="columnheader" style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: C.textMuted, padding: '4px 0' }}>
                {label}
              </div>
            ))}
            {days.map((day) => {
              const weekend = day.getDay() === 0 || day.getDay() === 6;
              const future = isAfter(day, todayDate) || weekend;
              const isSelected = isSameDay(day, selected);
              const isCurrent = isSameDay(day, todayDate);
              const outside = !isSameMonth(day, month);
              return (
                <button
                  key={iso(day)}
                  type="button"
                  role="gridcell"
                  data-day={iso(day)}
                  aria-selected={isSelected}
                  aria-label={`${format(day, 'EEEE, d MMM yyyy')}${weekend ? ', weekend, no standup' : future ? ', not available' : ''}`}
                  title={weekend ? 'Weekend — no standup' : undefined}
                  tabIndex={isSameDay(day, focused) ? 0 : -1}
                  disabled={future}
                  onClick={() => pick(day)}
                  onKeyDown={(event) => {
                    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
                    if (event.key in deltas) { event.preventDefault(); moveFocus(deltas[event.key]); }
                  }}
                  className="su-day"
                  style={{
                    height: 36,
                    border: 'none',
                    borderRadius: RADIUS.md,
                    fontSize: 13,
                    fontVariantNumeric: 'tabular-nums',
                    cursor: future ? 'not-allowed' : 'pointer',
                    background: isSelected ? C.accent : 'transparent',
                    color: isSelected ? '#FFFFFF' : future ? C.textDisabled : outside || isWeekend(day) ? C.textMuted : C.text,
                    fontWeight: isSelected || isCurrent ? 600 : 400,
                    boxShadow: isCurrent && !isSelected ? `inset 0 0 0 1px ${C.accent}` : 'none',
                  }}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: space(1), fontSize: 12, color: C.textMuted }}>Dates are in IST. Weekends are included in Monday&apos;s standup.</div>
        </div>
      )}
    </div>
  );
}

