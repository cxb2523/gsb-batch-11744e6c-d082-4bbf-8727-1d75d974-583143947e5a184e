'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, UserPlus } from 'lucide-react';

import type { Person } from '@/lib/api/lifecycle';
import { Avatar } from '@/design-system/components';
import { C, VISUALLY_HIDDEN, space } from './tokens';

export interface MemberOption {
  email: string;
  name: string;
}

interface Props {
  stageName: string;
  assignees: Person[];
  members: MemberOption[];
  disabled: boolean;
  /** How many faces to show before the rest become "+N". */
  max?: number;
  onChange: (emails: string[]) => void;
}

/** Searching a handful of names is noise; past that it is necessary. */
const SEARCH_FROM = 7;

/**
 * Who is carrying a stage, edited where it is shown.
 *
 * The trigger is the faces themselves. The popup is a checklist, and the change
 * is saved once when it closes rather than on every tick, so assigning three
 * people is one request and not three.
 */
export function AssigneePicker({ stageName, assignees, members, disabled, max = 3, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const current = useMemo(() => assignees.map((person) => person.email), [assignees]);

  const close = () => {
    setOpen(false);
    setQuery('');
    // Saved on close: same list, same order means nothing to send.
    if (picked.length !== current.length || picked.some((email, index) => email !== current[index])) {
      onChange(picked);
    }
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

  const start = () => {
    setPicked(current);
    setQuery('');
    setOpen(true);
    if (members.length >= SEARCH_FROM) requestAnimationFrame(() => searchRef.current?.focus());
  };

  // Updater form, not `picked` from this render: two ticks in quick succession
  // are batched, and reading the captured value would lose the first one.
  const toggle = (email: string) =>
    setPicked((current) => (current.includes(email) ? current.filter((item) => item !== email) : [...current, email]));

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? members.filter((member) => member.name.toLowerCase().includes(needle) || member.email.toLowerCase().includes(needle))
    : members;

  const faces = assignees.slice(0, max);
  const hidden = assignees.length - faces.length;

  return (
    <span className="lc-menu-wrap" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`lc-people${assignees.length === 0 ? ' is-empty' : ''}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={assignees.length ? assignees.map((person) => person.name).join(', ') : 'Nobody assigned'}
        aria-label={
          assignees.length
            ? `${stageName} assigned to ${assignees.map((person) => person.name).join(', ')}. Change`
            : `${stageName} has nobody assigned. Assign someone`
        }
        onClick={() => (open ? close() : start())}
      >
        {assignees.length === 0 ? (
          <>
            <UserPlus size={13} aria-hidden />
            Assign
          </>
        ) : (
          <>
            <span className="lc-faces" aria-hidden>
              {faces.map((person) => (
                <Avatar key={person.email} name={person.name} size={22} colorful />
              ))}
              {hidden > 0 && <span className="lc-face-more">+{hidden}</span>}
            </span>
            {assignees.length === 1 && <span className="lc-people-name">{assignees[0].name}</span>}
          </>
        )}
      </button>

      {open && (
        <span className="lc-menu lc-menu--wide" role="dialog" aria-label={`People on ${stageName}`}>
          {members.length >= SEARCH_FROM && (
            <span className="lc-menu-search">
              <Search size={14} aria-hidden />
              <label style={VISUALLY_HIDDEN} htmlFor={`people-${stageName}`}>Search people</label>
              <input
                ref={searchRef}
                id={`people-${stageName}`}
                value={query}
                placeholder="Search people"
                onChange={(event) => setQuery(event.target.value)}
              />
            </span>
          )}

          <span className="lc-menu-list">
            {shown.length === 0 ? (
              <span style={{ display: 'block', padding: `${space(1.5)}px ${space(1)}px`, fontSize: 13, color: C.textMuted }}>
                {members.length === 0 ? 'No project members to assign yet.' : `Nobody matches “${query.trim()}”.`}
              </span>
            ) : (
              shown.map((member) => {
                const on = picked.includes(member.email);
                return (
                  <button
                    key={member.email}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    className="lc-menu-item"
                    onClick={() => toggle(member.email)}
                  >
                    <span className={`lc-tick${on ? ' is-on' : ''}`} aria-hidden>
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <Avatar name={member.name} size={22} colorful />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {member.name}
                    </span>
                  </button>
                );
              })
            )}
          </span>

          <span className="lc-menu-foot">
            <span style={{ fontSize: 12, color: C.textMuted }}>
              {picked.length === 0 ? 'Nobody assigned' : `${picked.length} selected`}
            </span>
            <button type="button" className="lc-btn lc-btn--sm" onClick={close}>Done</button>
          </span>
        </span>
      )}
    </span>
  );
}
