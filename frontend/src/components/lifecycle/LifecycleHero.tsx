'use client';

import React from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowRight, Check, Play, Settings2 } from 'lucide-react';

import type { Lifecycle, LifecycleStage } from '@/lib/api/lifecycle';
import { STATE_STYLE, dayCount, space } from './tokens';

/** One solid fill per state, read on the light hero card and matching the state tokens. */
const SEGMENT: Record<string, string> = {
  done: '#22A06B',
  skipped: '#C1C7D0',
  in_progress: '#1D7AFC',
  blocked: '#E34935',
  not_started: '#E4E6EA',
};

interface Props {
  board: Lifecycle;
  momentum: string;
  selectedKey: string | null;
  onSelectStage: (stage: LifecycleStage) => void;
  /** Finish the stage in hand and start the next one. */
  onAdvance: (stage: LifecycleStage) => void;
  /** Put the first stage in progress, when nothing has started yet. */
  onStart: (stage: LifecycleStage) => void;
  onEditFlow: () => void;
  disabled: boolean;
}

/**
 * The top of the page: where the project stands, said once and said properly.
 *
 * The progress bar is one segment per stage rather than a ring, so it carries the
 * shape of the whole run at a glance (what is done, what is stuck, where the
 * checkpoints are) and doubles as a way to jump to a stage.
 */
export function LifecycleHero({ board, momentum, selectedKey, onSelectStage, onAdvance, onStart, onEditFlow, disabled }: Props) {
  const { stages, summary } = board;
  const current = stages.find((stage) => stage.key === board.current_stage) ?? null;
  const reached = stages.filter((stage) => stage.state === 'done' || stage.state === 'skipped').length;
  const percent = stages.length ? Math.round((reached / stages.length) * 100) : 0;
  const left = stages.length - reached;
  const position = current ? stages.findIndex((stage) => stage.key === current.key) + 1 : 0;
  const nextCheckpoint = stages.find((stage) => stage.is_milestone && stage.state !== 'done' && stage.state !== 'skipped');
  const action = nextAction(stages);
  // Before anything has moved, a big "0%" reads as broken. Show the score only once
  // there is progress to report; until then the headline and Start action carry the block.
  const showProgress = Boolean(summary.started_on) || reached > 0;

  return (
    <section className="lc-hero" aria-label="Where this project stands">
      <div className="lc-hero-top">
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="lc-hero-eyebrow">
            {board.project_key} <span aria-hidden>·</span> Lifecycle
          </p>
          <h1 className="lc-hero-title">{current ? current.name : 'Not started yet'}</h1>
          <p className="lc-hero-meta">
            {current?.codename && <span className="lc-hero-tag">{current.codename}</span>}
            {current ? (
              <>
                <span>Stage {position} of {stages.length}</span>
                <span aria-hidden className="lc-hero-dot" />
                <span>{dayCount(current.days)} here</span>
                {current.assignees.length > 0 && (
                  <>
                    <span aria-hidden className="lc-hero-dot" />
                    <span>{current.assignees.map((person) => person.name).join(', ')}</span>
                  </>
                )}
              </>
            ) : (
              <span>{stages.length} stages mapped out</span>
            )}
          </p>
          <p className="lc-hero-momentum">{momentum}</p>
          {action && (
            <button
              type="button"
              className="lc-advance"
              style={{ marginTop: 14 }}
              disabled={disabled}
              aria-label={action.next ? `${action.label}, then start ${action.next.name}` : action.label}
              onClick={() => (action.kind === 'start' ? onStart(action.stage) : onAdvance(action.stage))}
            >
              <span className="lc-advance-main">
                {action.kind === 'start' ? (
                  <Play size={15} aria-hidden style={{ flexShrink: 0 }} />
                ) : (
                  <span className="lc-advance-tick" aria-hidden>
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
                <span className="lc-advance-label">{action.label}</span>
              </span>
              {action.next && (
                <span className="lc-advance-next">
                  <ArrowRight size={14} aria-hidden className="lc-advance-arrow" />
                  <span className="lc-advance-label">{action.next.name}</span>
                  {action.next.is_milestone && <span className="lc-advance-pin" aria-hidden />}
                </span>
              )}
            </button>
          )}
        </div>

        <div className="lc-hero-score">
          {showProgress && (
            <>
              <div className="lc-hero-percent">
                {percent}
                <span>%</span>
              </div>
              <div className="lc-hero-left">
                {left === 0 ? 'Route complete' : `${left} of ${stages.length} stages to go`}
              </div>
            </>
          )}
          <button type="button" className="lc-ghost-btn" onClick={onEditFlow} disabled={disabled}>
            <Settings2 size={15} aria-hidden /> Edit Stages
          </button>
        </div>
      </div>

      <div className="lc-hero-bar" role="group" aria-label="Progress by stage">
        {stages.map((stage) => {
          const isCurrent = stage.key === board.current_stage;
          return (
            <button
              key={stage.key}
              type="button"
              className={`lc-seg${isCurrent ? ' is-current' : ''}${stage.key === selectedKey ? ' is-selected' : ''}`}
              style={{ background: SEGMENT[stage.state] ?? SEGMENT.not_started }}
              title={`${stage.name} (${STATE_STYLE[stage.state].label})`}
              aria-label={`${stage.name}, ${STATE_STYLE[stage.state].label}`}
              onClick={() => onSelectStage(stage)}
            >
              {stage.is_milestone && <span className="lc-seg-pin" aria-hidden />}
            </button>
          );
        })}
      </div>

      <dl className="lc-hero-stats">
        <Metric
          label="In the funnel"
          value={summary.started_on ? `${summary.total_days} ${summary.total_days === 1 ? 'day' : 'days'}` : 'Not started'}
        />
        <Metric
          label="Modules"
          value={summary.modules_total ? `${summary.modules_done} of ${summary.modules_total} done` : 'None yet'}
        />
        <Metric label="Started" value={summary.started_on ? format(parseISO(summary.started_on), 'd MMM yyyy') : 'Not yet'} />
        {summary.delivered_on ? (
          <Metric label="Delivered" value={format(parseISO(summary.delivered_on), 'd MMM yyyy')} />
        ) : (
          <Metric label="Next checkpoint" value={nextCheckpoint ? nextCheckpoint.name : 'All cleared'} />
        )}
      </dl>
    </section>
  );
}

type NextAction = {
  kind: 'start' | 'advance';
  /** The stage the button acts on. */
  stage: LifecycleStage;
  label: string;
  /** Where the project lands afterwards, or null on the last stage. */
  next: LifecycleStage | null;
};

/**
 * The one move that makes sense right now: start the run, or finish the stage in
 * hand and pick up the next. Null once every stage is done or skipped.
 */
function nextAction(stages: LifecycleStage[]): NextAction | null {
  const unfinished = stages.filter((stage) => stage.state !== 'done' && stage.state !== 'skipped');
  if (unfinished.length === 0) return null;

  const running = stages.find((stage) => stage.state === 'in_progress');
  if (!running) {
    const first = unfinished[0];
    return { kind: 'start', stage: first, label: `Start ${first.name}`, next: null };
  }

  return {
    kind: 'advance',
    stage: running,
    label: `Complete ${running.name}`,
    next: unfinished.find((stage) => stage.position > running.position) ?? null,
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0, paddingRight: space(2) }}>
      <dt className="lc-hero-stat-label">{label}</dt>
      <dd className="lc-hero-stat-value">{value}</dd>
    </div>
  );
}
