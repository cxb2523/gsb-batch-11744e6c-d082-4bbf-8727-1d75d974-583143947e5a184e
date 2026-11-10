'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Flag, Plus, Trash2, X } from 'lucide-react';
import type { LifecycleStage, StageDraft } from '@/lib/api/lifecycle';
import { C, LAYER, RADIUS, SHADOW, VISUALLY_HIDDEN, space } from './tokens';

interface Props {
  open: boolean;
  stages: LifecycleStage[];
  saving: boolean;
  onClose: () => void;
  onSave: (stages: StageDraft[]) => void;
}

type Draft = StageDraft & { rowId: string };

let rowSeq = 0;
const asDraft = (stage: LifecycleStage): Draft => ({
  rowId: `row-${rowSeq++}`, key: stage.key, codename: stage.codename ?? '', name: stage.name,
  team: stage.team ?? '', description: stage.description ?? '', is_milestone: stage.is_milestone,
});

/**
 * Tailors the flow for one project: rename, reorder, add or drop stages.
 * A stage that keeps its key keeps its recorded dates; dropping one loses them,
 * so that is spelled out before saving.
 */
export function FlowEditor({ open, stages, saving, onClose, onSave }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setDrafts(stages.map(asDraft));
      setError(null);
      requestAnimationFrame(() => closeRef.current?.focus());
    }
  }, [open, stages]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, input, textarea, [href], [tabindex]:not([tabindex="-1"])');
      const [first, last] = [focusable[0], focusable[focusable.length - 1]];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  const move = (index: number, delta: number) => {
    const next = [...drafts];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDrafts(next);
  };

  const dropped = stages.filter((stage) => !drafts.some((draft) => draft.key === stage.key));
  const recorded = dropped.filter((stage) => stage.state !== 'not_started');

  const save = () => {
    const cleaned = drafts.map((draft) => ({ ...draft, name: draft.name.trim() })).filter((draft) => draft.name);
    if (!cleaned.length) {
      setError('Keep at least one stage.');
      return;
    }
    onSave(cleaned.map(({ key, codename, name, team, description, is_milestone }) => ({
      key, codename: codename?.trim() || null, name, team: team || null, description: description || null,
      is_milestone: Boolean(is_milestone),
    })));
  };

  return (
    <div
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: LAYER.popover,
        background: 'rgba(9, 30, 66, 0.54)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: space(2),
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit the project's stages"
        style={{
          width: 'min(640px, 100%)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: C.surface,
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.overlay,
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: space(1), padding: `${space(2)}px ${space(2.5)}px`, borderBottom: `1px solid ${C.divider}` }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: C.text }}>Project Stages</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: C.textMuted }}>
              Most projects use the company flow. Change it here when this one genuinely differs.
            </p>
          </div>
          <button ref={closeRef} type="button" className="lc-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: space(2.5), display: 'flex', flexDirection: 'column', gap: space(1) }}>
          {drafts.map((draft, index) => (
            <div key={draft.rowId} style={{ display: 'flex', alignItems: 'flex-start', gap: space(1) }}>
              <span style={{ width: 20, paddingTop: 12, fontSize: 12, color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>{index + 1}</span>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.6fr) minmax(0, 1fr)', gap: space(1) }}>
                <div>
                  <label style={VISUALLY_HIDDEN} htmlFor={`${draft.rowId}-codename`}>Codename</label>
                  <input
                    id={`${draft.rowId}-codename`}
                    className="lc-input"
                    value={draft.codename ?? ''}
                    maxLength={40}
                    placeholder="Codename"
                    onChange={(event) => setDrafts(drafts.map((item) => (item.rowId === draft.rowId ? { ...item, codename: event.target.value } : item)))}
                  />
                </div>
                <div>
                  <label style={VISUALLY_HIDDEN} htmlFor={`${draft.rowId}-name`}>Stage name</label>
                  <input
                    id={`${draft.rowId}-name`}
                    className="lc-input"
                    value={draft.name}
                    maxLength={120}
                    placeholder="Stage name"
                    onChange={(event) => setDrafts(drafts.map((item) => (item.rowId === draft.rowId ? { ...item, name: event.target.value } : item)))}
                  />
                </div>
                <div>
                  <label style={VISUALLY_HIDDEN} htmlFor={`${draft.rowId}-team`}>Team</label>
                  <input
                    id={`${draft.rowId}-team`}
                    className="lc-input"
                    value={draft.team ?? ''}
                    maxLength={60}
                    placeholder="Team"
                    onChange={(event) => setDrafts(drafts.map((item) => (item.rowId === draft.rowId ? { ...item, team: event.target.value } : item)))}
                  />
                </div>
              </div>
              <label
                title="Flag as a milestone"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, paddingTop: 10, fontSize: 12, color: draft.is_milestone ? '#974F0C' : C.textMuted, whiteSpace: 'nowrap' }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(draft.is_milestone)}
                  onChange={(event) => setDrafts(drafts.map((item) => (item.rowId === draft.rowId ? { ...item, is_milestone: event.target.checked } : item)))}
                  style={{ width: 16, height: 16, accentColor: '#FFAB00', cursor: 'pointer' }}
                />
                <Flag size={12} aria-hidden />
                <span style={VISUALLY_HIDDEN}>Milestone</span>
              </label>
              <button type="button" className="lc-icon-btn" aria-label={`Move ${draft.name || 'stage'} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp size={16} />
              </button>
              <button type="button" className="lc-icon-btn" aria-label={`Move ${draft.name || 'stage'} down`} disabled={index === drafts.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown size={16} />
              </button>
              <button type="button" className="lc-icon-btn" aria-label={`Remove ${draft.name || 'stage'}`} onClick={() => setDrafts(drafts.filter((item) => item.rowId !== draft.rowId))}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          <button
            type="button"
            className="lc-btn lc-btn--sm"
            style={{ alignSelf: 'flex-start', marginTop: space(1) }}
            onClick={() => setDrafts([...drafts, { rowId: `row-${rowSeq++}`, name: '', team: '', description: '' }])}
          >
            <Plus size={14} aria-hidden /> Add Stage
          </button>

          {recorded.length > 0 && (
            <p role="status" style={{ margin: `${space(1)}px 0 0`, fontSize: 13, color: C.danger, lineHeight: 1.5 }}>
              Removing {recorded.map((stage) => stage.name).join(', ')} also removes the dates already recorded against{' '}
              {recorded.length === 1 ? 'it' : 'them'}.
            </p>
          )}
          {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: C.danger }}>{error}</p>}
        </div>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: space(1), padding: `${space(2)}px ${space(2.5)}px`, borderTop: `1px solid ${C.divider}` }}>
          <button type="button" className="lc-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="lc-btn lc-btn--primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Stages'}
          </button>
        </footer>
      </div>
    </div>
  );
}
