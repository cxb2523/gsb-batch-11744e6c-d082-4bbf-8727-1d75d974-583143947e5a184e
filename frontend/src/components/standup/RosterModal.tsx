'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Plus, Search, X } from 'lucide-react';
import { Avatar } from '@/design-system/components';
import { useToast, ButtonCore } from '@/components/ui';
import { RosterMember, errorStatus, standupAPI } from '@/lib/api/standup';
import { C, RADIUS, SHADOW, space } from './tokens';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function loadErrorCopy(error: unknown): string {
  const code = errorStatus(error);
  if (code === 'offline') return "You're offline. Reconnect and try again.";
  if (code === 'timeout') return 'This is taking too long. Try again.';
  if (code === 403) return 'Only admins can change who is in the standup.';
  return "Couldn't load people. Try again.";
}

export function RosterModal({ isOpen, onClose, onSaved }: Props) {
  const toast = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [original, setOriginal] = useState<string[]>([]);
  const [selected, setSelected] = useState<RosterMember[]>([]);
  const [candidates, setCandidates] = useState<RosterMember[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [roster, people] = await Promise.all([standupAPI.getRoster(), standupAPI.getRosterCandidates()]);
      setSelected(roster.members);
      setOriginal(roster.members.map((member) => member.email));
      setCandidates(people);
      setStatus('ready');
    } catch (error) {
      setLoadError(loadErrorCopy(error));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setQuery('');
    setSaveError('');
    setConfirmDiscard(false);
    load();
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => returnFocusRef.current?.focus?.();
  }, [isOpen, load]);

  const dirty = useMemo(() => {
    const current = selected.map((member) => member.email);
    return current.length !== original.length || current.some((email, index) => email !== original[index]);
  }, [selected, original]);

  const selectedEmails = useMemo(() => new Set(selected.map((member) => member.email)), [selected]);
  const available = useMemo(() => {
    const term = query.trim().toLowerCase();
    return candidates
      .filter((person) => !selectedEmails.has(person.email))
      .filter((person) => !term || person.name.toLowerCase().includes(term) || person.email.toLowerCase().includes(term));
  }, [candidates, selectedEmails, query]);

  const requestClose = () => {
    if (saving) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= selected.length || from === to) return;
    setSelected((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await standupAPI.putRoster(selected.map((member) => member.email));
      toast.success('Standup people updated');
      onSaved();
      onClose();
    } catch (error) {
      const code = errorStatus(error);
      setSaveError(
        code === 403
          ? 'Only admins can change who is in the standup.'
          : code === 'offline'
            ? "You're offline. Your changes are still here, reconnect and save again."
            : "Couldn't save. Your changes are still here, try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (confirmDiscard) setConfirmDiscard(false);
      else requestClose();
      return;
    }
    if (event.key === 'Tab' && dialogRef.current) {
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };

  return (
    <div
      onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(9, 30, 66, 0.54)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space(2) }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="su-roster-title"
        onKeyDown={onKeyDown}
        style={{ width: 760, maxWidth: '100%', maxHeight: 'min(680px, 92vh)', display: 'flex', flexDirection: 'column', background: C.surface, borderRadius: RADIUS.xl, boxShadow: SHADOW.overlay }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: space(2), padding: `${space(2.5)}px ${space(3)}px ${space(2)}px`, borderBottom: `1px solid ${C.divider}` }}>
          <div style={{ flex: 1 }}>
            <h2 id="su-roster-title" style={{ margin: 0, fontSize: 18, fontWeight: 600, color: C.text }}>Standup People</h2>
            <p style={{ margin: `${space(0.5)}px 0 0`, fontSize: 13, color: C.textMuted }}>
              Choose who is in the daily standup. The order here is the order people are presented in.
            </p>
          </div>
          <button type="button" className="su-icon-btn" aria-label="Close" onClick={requestClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {status === 'loading' && (
          <div style={{ padding: space(3), display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space(3) }} aria-busy="true">
            {[0, 1].map((column) => (
              <div key={column} style={{ display: 'flex', flexDirection: 'column', gap: space(1) }}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="su-skeleton" style={{ height: 40 }} />
                ))}
              </div>
            ))}
          </div>
        )}

        {status === 'error' && (
          <div style={{ padding: space(4), textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: space(1.5) }}>
            <div style={{ fontSize: 14, color: C.textBody }}>{loadError}</div>
            <ButtonCore variant="secondary" size="lg" onClick={load}>Try Again</ButtonCore>
          </div>
        )}

        {status === 'ready' && (
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
            {/* In standup */}
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: `1px solid ${C.divider}` }}>
              <div style={{ padding: `${space(1.5)}px ${space(3)}px`, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: C.textMuted }}>
                In Standup · {selected.length}
              </div>
              <ol style={{ listStyle: 'none', margin: 0, padding: `0 ${space(2)}px ${space(2)}px`, overflowY: 'auto', flex: 1 }}>
                {selected.length === 0 && (
                  <li style={{ padding: space(3), textAlign: 'center', fontSize: 13, color: C.textMuted }}>
                    Nobody yet. Add people from the list on the right.
                  </li>
                )}
                {selected.map((member, index) => (
                  <li
                    key={member.email}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => { if (dragIndex !== null) move(dragIndex, index); setDragIndex(null); }}
                    onDragEnd={() => setDragIndex(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: space(1), minHeight: 48, padding: '4px 4px 4px 0',
                      borderRadius: RADIUS.md, background: dragIndex === index ? C.accentSoft : 'transparent',
                    }}
                  >
                    <span aria-hidden style={{ display: 'inline-flex', color: C.textMuted, cursor: 'grab', padding: '0 2px' }}>
                      <GripVertical size={16} />
                    </span>
                    <span style={{ width: 20, fontSize: 12, color: C.textMuted, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{index + 1}</span>
                    <Avatar name={member.name} src={member.photo} colorful size={28} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</span>
                      {(!member.is_active || !member.has_account) && (
                        <span style={{ display: 'block', fontSize: 12, color: member.is_active ? C.textMuted : C.warning }}>
                          {member.is_active ? "Hasn't joined GRID yet" : 'Deactivated, hidden from the board'}
                        </span>
                      )}
                    </span>
                    <button type="button" className="su-icon-btn" aria-label={`Move ${member.name} up`} disabled={index === 0} onClick={() => move(index, index - 1)}>
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" className="su-icon-btn" aria-label={`Move ${member.name} down`} disabled={index === selected.length - 1} onClick={() => move(index, index + 1)}>
                      <ArrowDown size={14} />
                    </button>
                    <button type="button" className="su-icon-btn" aria-label={`Remove ${member.name} from standup`} onClick={() => setSelected((current) => current.filter((m) => m.email !== member.email))}>
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ol>
            </div>

            {/* Add people */}
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: `${space(1)}px ${space(2)}px` }}>
                <label htmlFor="su-roster-search" style={{ display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: C.textMuted, padding: `${space(0.5)}px ${space(1)}px ${space(1)}px` }}>
                  Add People
                </label>
                <div style={{ position: 'relative' }}>
                  <Search size={16} aria-hidden color={C.textMuted} style={{ position: 'absolute', left: 12, top: 12 }} />
                  <input
                    id="su-roster-search"
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by name"
                    autoComplete="off"
                    style={{ width: '100%', height: 40, padding: '0 12px 0 36px', border: `1px solid ${C.border}`, borderRadius: RADIUS.md, fontSize: 14, color: C.text, outline: 'none', font: 'inherit' }}
                    onFocus={(event) => { event.currentTarget.style.boxShadow = `0 0 0 2px ${C.focus}`; }}
                    onBlur={(event) => { event.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: `0 ${space(2)}px ${space(2)}px`, overflowY: 'auto', flex: 1 }}>
                {available.length === 0 && (
                  <li style={{ padding: space(3), textAlign: 'center', fontSize: 13, color: C.textMuted }}>
                    {query.trim() ? `No one matches "${query.trim()}"` : 'Everyone is already in the standup.'}
                  </li>
                )}
                {available.map((person) => (
                  <li key={person.email}>
                    <button
                      type="button"
                      className="su-rail-item"
                      aria-label={`Add ${person.name} to standup`}
                      onClick={() => setSelected((current) => [...current, person])}
                    >
                      <Avatar name={person.name} src={person.photo} colorful size={28} />
                      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</span>
                        <span style={{ display: 'block', fontSize: 12, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {person.has_account ? person.email : "Hasn't joined GRID yet"}
                        </span>
                      </span>
                      <Plus size={16} aria-hidden color={C.accent} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: space(1.5), padding: `${space(1.5)}px ${space(3)}px`, borderTop: `1px solid ${C.divider}` }}>
          {confirmDiscard ? (
            <>
              <span style={{ flex: 1, fontSize: 13, color: C.text }} role="alert">Discard your changes to the standup people?</span>
              <ButtonCore variant="secondary" size="lg" onClick={() => setConfirmDiscard(false)}>Keep Editing</ButtonCore>
              <ButtonCore variant="danger" size="lg" onClick={onClose}>Discard Changes</ButtonCore>
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontSize: 13, color: saveError ? C.danger : C.textMuted }} role={saveError ? 'alert' : undefined}>
                {saveError || (dirty ? 'Unsaved changes' : '')}
              </span>
              <ButtonCore variant="secondary" size="lg" onClick={requestClose} disabled={saving}>Cancel</ButtonCore>
              <span title={!dirty && status === 'ready' ? 'Make a change to save' : undefined}>
                <ButtonCore variant="primary" size="lg" onClick={save} disabled={!dirty || saving || status !== 'ready'} style={{ minWidth: 132 }}>
                  {saving ? 'Saving…' : 'Save People'}
                </ButtonCore>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
