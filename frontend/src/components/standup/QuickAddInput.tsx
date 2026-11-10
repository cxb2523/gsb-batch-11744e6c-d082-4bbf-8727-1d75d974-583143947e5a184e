'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { C, VISUALLY_HIDDEN, space } from './tokens';
import { ButtonCore } from '@/components/ui';

interface Props {
  /** Text on the collapsed button, e.g. "Add Adhoc Task". */
  triggerLabel: string;
  /** Screen-reader label for the text field. */
  label: string;
  placeholder: string;
  maxLength: number;
  emptyError: string;
  failureError: string;
  /** Resolves false when saving failed, so the typed text is put back. */
  onAdd: (text: string) => Promise<boolean>;
}

const COUNTER_MARGIN = 100;

/**
 * A ghost "+ Add …" button that opens an inline composer. Enter adds and keeps
 * the composer open for the next entry; Esc or Cancel closes it. Text clears on
 * submit (the item shows optimistically) and comes back with an error if saving fails.
 */
export function QuickAddInput({ triggerLabel, label, placeholder, maxLength, emptyError, failureError, onAdd }: Props) {
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setText('');
    setError(null);
    // The trigger remounts on close; focus it on the next frame.
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const submit = async () => {
    if (saving) return;
    const value = text.trim();
    if (!value) {
      setError(emptyError);
      inputRef.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    setText('');
    const saved = await onAdd(value);
    setSaving(false);
    if (!saved) {
      setText(value);
      setError(failureError);
    }
    inputRef.current?.focus();
  };

  if (!open) {
    return (
      <ButtonCore ref={triggerRef} variant="ghost" size="md" onClick={() => setOpen(true)} leftIcon={<Plus size={14} aria-hidden />}>
        {triggerLabel}
      </ButtonCore>
    );
  }

  return (
    <form
      className="su-composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={inputId} style={VISUALLY_HIDDEN}>{label}</label>
      <input
        ref={inputRef}
        id={inputId}
        className="su-input"
        type="text"
        value={text}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setText(event.target.value);
          if (error && event.target.value.trim()) setError(null);
        }}
        onKeyDown={(event) => {
          // Handled here rather than left to implicit form submission, which not every
          // key source triggers; skipped mid-IME composition so Enter picks the candidate.
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
        }}
      />
      {error && (
        <div id={errorId} role="alert" style={{ fontSize: 12, color: C.danger }}>{error}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: space(1) }}>
        <span style={{ fontSize: 12, color: C.textMuted }}>
          {text.length >= maxLength - COUNTER_MARGIN ? `${text.length}/${maxLength}` : 'Enter to add · Esc to close'}
        </span>
        <span style={{ flex: 1 }} />
        <ButtonCore variant="ghost" size="md" onClick={close}>Cancel</ButtonCore>
        <ButtonCore type="submit" variant="primary" size="md" disabled={saving}>Add</ButtonCore>
      </div>
    </form>
  );
}
