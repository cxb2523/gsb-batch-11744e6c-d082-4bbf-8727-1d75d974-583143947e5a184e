'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { Label } from '../../lib/api/settings';

export function LabelPicker({
  labels,
  selectedIds,
  onChange,
  disabled,
}: {
  labels: Label[];
  selectedIds: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // The details rail scrolls, so an absolutely-positioned menu gets clipped by it.
  // Measure the trigger and render the menu into the body, like Select does.
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) setMenuRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    measure();
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  const selected = labels.filter((label) => selectedIds.includes(label.id));

  const toggle = (id: number) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="td-ghost"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: '100%',
          minHeight: 30,
          padding: '4px 8px',
          textAlign: 'left',
          borderRadius: 4,
          fontSize: 13,
          fontFamily: 'inherit',
          cursor: disabled ? 'default' : 'pointer',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          alignItems: 'center',
        }}
      >
        <span style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', minWidth: 0 }}>
          {selected.length === 0 ? (
            <span style={{ color: tokens.colors.neutral[500] }}>No labels</span>
          ) : (
            selected.map((label) => (
              <span
                key={label.id}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: label.color || tokens.colors.neutral[200],
                  color: tokens.colors.neutral[900],
                }}
              >
                {label.name}
              </span>
            ))
          )}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, color: '#6B778C', marginLeft: 4, opacity: (hovered || open) ? 1 : 0, transition: 'opacity 0.12s' }} />
      </button>

      {open && menuRect && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuRect.top,
            left: menuRect.left,
            minWidth: menuRect.width,
            maxHeight: 240,
            overflowY: 'auto',
            background: '#FFFFFF',
            border: `1px solid ${tokens.colors.neutral[200]}`,
            borderRadius: 6,
            boxShadow: '0 8px 16px rgba(9, 30, 66, 0.15)',
            zIndex: 100010,
          }}
        >
          {labels.length === 0 && (
            <div style={{ padding: 12, fontSize: 13, color: tokens.colors.neutral[500] }}>
              No labels in this project
            </div>
          )}
          {labels.map((label) => (
            <div
              key={label.id}
              onClick={() => toggle(label.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <input type="checkbox" readOnly checked={selectedIds.includes(label.id)} />
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: label.color || tokens.colors.neutral[300],
                }}
              />
              {label.name}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
