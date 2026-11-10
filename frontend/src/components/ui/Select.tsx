'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
  /** Small text under the label, e.g. an email under a person's name. */
  hint?: string;
  /** Colour swatch shown before the label, e.g. a workflow status colour. */
  color?: string;
  disabled?: boolean;
  /** Custom row content, e.g. a type tile or priority flag. */
  render?: React.ReactNode;
}

export interface SelectProps<T extends string | number = string> {
  value: T | null;
  onChange: (value: T | null) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  /** Adds a "clear" entry at the top of the list. */
  clearable?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  /** Renders the trigger in the error state. Used for required fields left empty. */
  invalid?: boolean;
  size?: 'sm' | 'md';
  /**
   * 'ghost' renders the trigger as plain text until hovered or opened, so a
   * dense table reads as values rather than a wall of form controls.
   */
  variant?: 'default' | 'ghost';
  /** Shown in place of the placeholder when ghost triggers are not hovered. */
  emptyLabel?: string;
  fullWidth?: boolean;
  /** Force the filter box on or off. Defaults to on once the list gets long. */
  searchable?: boolean;
  /** Keeps the trigger showing the placeholder after a pick — for "apply to all" controls. */
  resetAfterSelect?: boolean;
  ariaLabel?: string;
  style?: React.CSSProperties;
  minMenuWidth?: number;
  /** Replaces the trigger's text with custom content, e.g. a chip or avatar. */
  renderTrigger?: (option: SelectOption<T> | null) => React.ReactNode;
  /** Hides the built-in caret — for a `renderTrigger` that already draws its own. */
  hideChevron?: boolean;
}

const COLORS = {
  border: '#DFE1E6',
  borderHover: '#B3BAC5',
  focus: '#4C9AFF',
  primary: '#0052CC',
  text: '#172B4D',
  muted: '#6B778C',
  surface: '#FFFFFF',
  hover: '#F4F5F7',
  selected: '#DEEBFF',
  danger: '#DE350B',
  dangerBg: '#FFEBE6',
  disabledBg: '#FAFBFC',
};

const SIZES = {
  sm: { height: 32, font: 13, padX: 8 },
  md: { height: 40, font: 14, padX: 12 },
};

const SEARCH_THRESHOLD = 8;
const MENU_MAX_HEIGHT = 280;
const MENU_GAP = 4;

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  /** Menu opens upward when there is not enough room below. */
  dropUp: boolean;
  maxHeight: number;
}

export function Select<T extends string | number = string>({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  clearable = false,
  clearLabel = 'None',
  disabled = false,
  invalid = false,
  size = 'md',
  variant = 'default',
  fullWidth = true,
  searchable,
  resetAfterSelect = false,
  ariaLabel,
  style,
  minMenuWidth,
  emptyLabel,
  renderTrigger,
  hideChevron = false,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [mounted, setMounted] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const instanceId = useRef(`select-${Math.random().toString(36).slice(2, 9)}`);

  const metrics = SIZES[size];
  const showSearch = searchable ?? options.length >= SEARCH_THRESHOLD;

  useEffect(() => setMounted(true), []);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

  // The clear entry is modelled as a real row so keyboard navigation reaches it.
  type Row = { kind: 'clear' } | { kind: 'option'; option: SelectOption<T> };
  const rows: Row[] = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matched = term
      ? options.filter(
          (option) =>
            option.label.toLowerCase().includes(term) ||
            (option.hint ?? '').toLowerCase().includes(term)
        )
      : options;
    const list: Row[] = matched.map((option) => ({ kind: 'option', option }));
    if (clearable && !term) list.unshift({ kind: 'clear' });
    return list;
  }, [options, query, clearable]);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const dropUp = below < Math.min(MENU_MAX_HEIGHT, 180) && above > below;
    const maxHeight = Math.min(MENU_MAX_HEIGHT, dropUp ? above : below);
    setPosition({
      top: dropUp ? rect.top - MENU_GAP : rect.bottom + MENU_GAP,
      left: rect.left,
      width: Math.max(rect.width, minMenuWidth ?? 0),
      dropUp,
      maxHeight,
    });
  }, [minMenuWidth]);

  // Position is fixed to the viewport, so it must follow scroll and resize. A
  // portal is required: the preview table scrolls with overflow:auto and would
  // clip an absolutely-positioned menu.
  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const handler = () => measure();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const selectedIndex = rows.findIndex(
      (row) => row.kind === 'option' && row.option.value === value
    );
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    if (showSearch) requestAnimationFrame(() => searchRef.current?.focus());
    // Only when the menu opens — re-running on every keystroke would fight the
    // arrow keys for control of the active row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const commit = (row: Row) => {
    if (row.kind === 'clear') {
      onChange(null);
    } else {
      if (row.option.disabled) return;
      onChange(row.option.value);
    }
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;

    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setOpen(false);
        break;
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((current) => (rows.length ? (current + 1) % rows.length : 0));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((current) => (rows.length ? (current - 1 + rows.length) % rows.length : 0));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(Math.max(0, rows.length - 1));
        break;
      case 'Enter':
        event.preventDefault();
        if (rows[activeIndex]) commit(rows[activeIndex]);
        break;
      default:
        break;
    }
  };

  const isGhost = variant === 'ghost';
  const ghostQuiet = isGhost && !open && !hovered && !invalid;
  const borderColor = invalid
    ? COLORS.danger
    : open
    ? COLORS.focus
    : ghostQuiet
    ? 'transparent'
    : COLORS.border;
  const triggerLabel = resetAfterSelect ? null : selectedOption;

  const menu =
    open && position && mounted
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            id={`${instanceId.current}-listbox`}
            aria-label={ariaLabel ?? placeholder}
            style={{
              position: 'fixed',
              top: position.dropUp ? undefined : position.top,
              bottom: position.dropUp ? window.innerHeight - position.top : undefined,
              left: position.left,
              minWidth: position.width,
              maxWidth: Math.max(position.width, 320),
              maxHeight: position.maxHeight,
              display: 'flex',
              flexDirection: 'column',
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              boxShadow: '0 8px 16px rgba(9, 30, 66, 0.15), 0 0 1px rgba(9, 30, 66, 0.31)',
              // Above every modal layer in the app. The ticket detail modal renders
              // at 9999 and its own portals at 100000, so a lower value put this
              // menu behind the modal — it opened, but nothing was visible.
              zIndex: 100010,
              overflow: 'hidden',
            }}
          >
            {showSearch && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 10px',
                  borderBottom: `1px solid ${COLORS.border}`,
                }}
              >
                <Search size={14} color={COLORS.muted} />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Filter…"
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    fontSize: 13,
                    color: COLORS.text,
                    background: 'transparent',
                  }}
                />
              </div>
            )}

            <div style={{ overflowY: 'auto' }}>
              {rows.length === 0 && (
                <div style={{ padding: '12px 12px', fontSize: 13, color: COLORS.muted }}>
                  No matches
                </div>
              )}

              {rows.map((row, index) => {
                const isActive = index === activeIndex;
                const isSelected =
                  row.kind === 'clear' ? value === null : row.option.value === value;
                const label = row.kind === 'clear' ? clearLabel : row.option.label;
                const rowDisabled = row.kind === 'option' && row.option.disabled;

                return (
                  <div
                    key={row.kind === 'clear' ? '__clear' : String(row.option.value)}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={rowDisabled || undefined}
                    id={`${instanceId.current}-option-${index}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => commit(row)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      fontSize: 13,
                      cursor: rowDisabled ? 'not-allowed' : 'pointer',
                      opacity: rowDisabled ? 0.5 : 1,
                      background: isActive ? COLORS.hover : 'transparent',
                      color: row.kind === 'clear' ? COLORS.muted : COLORS.text,
                    }}
                  >
                    {row.kind === 'option' && row.option.color && (
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: row.option.color,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.kind === 'option' && row.option.render}
                        {label}
                      </span>
                      {row.kind === 'option' && row.option.hint && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: 11,
                            color: COLORS.muted,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.option.hint}
                        </span>
                      )}
                    </span>
                    {isSelected && !resetAfterSelect && (
                      <Check size={14} color={COLORS.primary} style={{ flexShrink: 0 }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${instanceId.current}-listbox` : undefined}
        aria-activedescendant={open ? `${instanceId.current}-option-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => !disabled && setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: fullWidth ? '100%' : 'auto',
          height: metrics.height,
          padding: `0 ${metrics.padX}px`,
          fontSize: metrics.font,
          fontFamily: 'inherit',
          textAlign: 'left',
          color: triggerLabel ? COLORS.text : COLORS.muted,
          background: disabled
            ? isGhost
              ? 'transparent'
              : COLORS.disabledBg
            : invalid
            ? COLORS.dangerBg
            : ghostQuiet
            ? 'transparent'
            : COLORS.surface,
          border: `1px solid ${borderColor}`,
          boxShadow: open ? `0 0 0 2px rgba(76, 154, 255, 0.4)` : 'none',
          borderRadius: 4,
          cursor: disabled ? 'default' : 'pointer',
          outline: 'none',
          transition: 'border-color 0.12s, background 0.12s, box-shadow 0.12s',
          ...style,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {renderTrigger ? (
          <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
            {renderTrigger(triggerLabel)}
          </span>
        ) : (
        <>
        {triggerLabel?.color && (
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: triggerLabel.color,
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {triggerLabel ? triggerLabel.label : ghostQuiet && emptyLabel ? emptyLabel : placeholder}
        </span>
        </>
        )}
        {!hideChevron && (
          <ChevronDown
            size={14}
            color={COLORS.muted}
            style={{
              flexShrink: 0,
              opacity: ghostQuiet ? 0 : 1,
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s, opacity 0.12s',
            }}
          />
        )}
      </button>
      {menu}
    </>
  );
}
