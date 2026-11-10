'use client';

import React, { useEffect, useId, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { LifecycleStage, StagePatch } from '@/lib/api/lifecycle';
import { AssigneePicker, type MemberOption } from './AssigneePicker';
import { C, RADIUS, STATE_ORDER, STATE_STYLE, dayCount, space } from './tokens';

export type { MemberOption };

interface Props {
  stage: LifecycleStage;
  saving: boolean;
  members: MemberOption[];
  onChange: (patch: StagePatch) => void;
}

const FIELD_LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: C.textSubtle,
  marginBottom: 6,
};

/** Everything recorded about one stage, editable in place. */
export function StageDetail({ stage, members, saving, onChange }: Props) {
  const targetId = useId();
  const noteId = useId();
  const [note, setNote] = useState(stage.note ?? '');

  // A different stage (or someone else's edit) replaces what's in the box.
  useEffect(() => setNote(stage.note ?? ''), [stage.key, stage.note]);

  const noteChanged = note.trim() !== (stage.note ?? '').trim();

  return (
    <section aria-label={`${stage.name} details`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space(2.5) }}>
        {stage.description && (
          <p style={{ margin: 0, fontSize: 13, color: C.textSubtle, lineHeight: 1.55 }}>{stage.description}</p>
        )}

        <div>
          <span style={FIELD_LABEL}>Where it stands</span>
          <div className="lc-states" role="group" aria-label={`Stage of ${stage.name}`}>
            {STATE_ORDER.map((state) => {
              const style = STATE_STYLE[state];
              const active = stage.state === state;
              return (
                <button
                  key={state}
                  type="button"
                  className="lc-state-opt"
                  aria-pressed={active}
                  disabled={saving}
                  onClick={() => !active && onChange({ state })}
                >
                  <span className="lc-state-swatch" style={{ background: style.dot }} aria-hidden />
                  {style.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: space(2) }}>
          <div>
            <span style={FIELD_LABEL}>Assigned to</span>
            <AssigneePicker
              stageName={stage.name}
              assignees={stage.assignees}
              members={members}
              disabled={saving}
              max={5}
              onChange={(emails) => onChange(emails.length ? { assignees: emails } : { clear: ['assignees'] })}
            />
          </div>

          <div>
            <label htmlFor={targetId} style={FIELD_LABEL}>Target date</label>
            <div style={{ position: 'relative' }}>
              <CalendarDays
                size={15}
                aria-hidden
                style={{ position: 'absolute', left: 11, top: '50%', marginTop: -7, color: stage.is_overdue ? C.danger : C.textMuted, pointerEvents: 'none' }}
              />
              <input
                id={targetId}
                className="lc-input"
                type="date"
                value={stage.target_date ?? ''}
                disabled={saving}
                aria-describedby={stage.is_overdue ? `${targetId}-late` : undefined}
                style={{
                  paddingLeft: 34,
                  borderColor: stage.is_overdue ? C.dangerDot : undefined,
                  background: stage.is_overdue ? C.dangerSoft : undefined,
                  color: stage.is_overdue ? C.danger : undefined,
                }}
                onChange={(event) => onChange(event.target.value ? { target_date: event.target.value } : { clear: ['target_date'] })}
              />
            </div>
            {stage.is_overdue && (
              <p id={`${targetId}-late`} style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 600, color: C.danger }}>
                Past its target date.
              </p>
            )}
          </div>
        </div>

        <Timeline stage={stage} saving={saving} onChange={onChange} />

        <div>
          <label htmlFor={noteId} style={FIELD_LABEL}>Notes</label>
          <textarea
            id={noteId}
            className="lc-input"
            rows={3}
            value={note}
            maxLength={2000}
            placeholder="Decisions, links, what's holding it up"
            disabled={saving}
            onChange={(event) => setNote(event.target.value)}
          />
          {noteChanged && (
            <div style={{ display: 'flex', gap: space(1), marginTop: space(1) }}>
              <button
                type="button"
                className="lc-btn lc-btn--primary lc-btn--sm"
                disabled={saving}
                onClick={() => onChange({ note: note.trim() || null, clear: note.trim() ? [] : ['note'] })}
              >
                Save Note
              </button>
              <button type="button" className="lc-btn lc-btn--sm" disabled={saving} onClick={() => setNote(stage.note ?? '')}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Started, time spent, finished: read left to right, and both ends editable.
 *
 * Moving a stage fills these in on its own, but a project that was already
 * running before it was tracked here needs them written down by hand, so the
 * dates are the truth and the day count follows them.
 */
function Timeline({ stage, saving, onChange }: { stage: LifecycleStage; saving: boolean; onChange: (patch: StagePatch) => void }) {
  const running = stage.state === 'in_progress';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: space(1.5),
        padding: `${space(1.5)}px ${space(2)}px`,
        background: C.surfaceSunken,
        borderRadius: RADIUS.xl,
      }}
    >
      <DatePoint
        label="Started"
        value={stage.started_at}
        stageName={stage.name}
        saving={saving}
        onChange={(value) => onChange(value ? { started_at: value } : { clear: ['started_at'] })}
      />
      <div style={{ flex: 1, minWidth: 30, display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 10 }}>
        <span aria-hidden style={{ flex: 1, height: 2, borderRadius: 2, background: stage.started_at ? '#C1C7D0' : C.divider }} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: running ? C.accent : C.textSubtle,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {stage.state === 'not_started' && !stage.started_at ? 'Not started' : dayCount(stage.days)}
        </span>
        <span aria-hidden style={{ flex: 1, height: 2, borderRadius: 2, background: stage.completed_at ? '#C1C7D0' : C.divider }} />
      </div>
      <DatePoint
        label="Finished"
        value={stage.completed_at}
        stageName={stage.name}
        saving={saving}
        onChange={(value) => onChange(value ? { completed_at: value } : { clear: ['completed_at'] })}
      />
    </div>
  );
}

function DatePoint({
  label,
  value,
  stageName,
  saving,
  onChange,
}: {
  label: string;
  value: string | null;
  stageName: string;
  saving: boolean;
  onChange: (value: string | null) => void;
}) {
  const id = useId();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ flexShrink: 0 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSubtle }}>
        {label}
      </label>
      <input
        id={id}
        type="date"
        className="lc-inline-date"
        value={value ? value.slice(0, 10) : ''}
        // These record what happened, so a date after today is not offered.
        max={today}
        disabled={saving}
        aria-label={`${label} date for ${stageName}`}
        onChange={(event) => onChange(event.target.value || null)}
      />
    </div>
  );
}
