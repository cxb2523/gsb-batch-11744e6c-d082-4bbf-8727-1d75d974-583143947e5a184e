'use client';

import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, Check, Circle, CircleDot, Flag, type LucideIcon, MessageSquare, MinusCircle, Paperclip } from 'lucide-react';

import type { LifecycleStage, StageState } from '@/lib/api/lifecycle';
import { AssigneePicker, type MemberOption } from './AssigneePicker';
import { StageStateMenu } from './StageStateMenu';
import { C, RADIUS, STATE_STYLE, dayCount, plural, space } from './tokens';

const STATE_ICON: Record<StageState, LucideIcon> = {
  not_started: Circle,
  in_progress: CircleDot,
  done: Check,
  blocked: AlertTriangle,
  skipped: MinusCircle,
};

/** The stage's short codename, worn as a tag next to its real name. */
export function CodeTag({ codename }: { codename: string }) {
  return (
    <span
      title="Shorthand the team uses for this step"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 18,
        padding: '0 7px',
        borderRadius: RADIUS.sm,
        border: `1px solid ${C.accentSoftBorder}`,
        background: C.accentSoft,
        color: '#0055CC',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {codename}
    </span>
  );
}

export function StateChip({ state, small }: { state: StageState; small?: boolean }) {
  const style = STATE_STYLE[state];
  const Icon = STATE_ICON[state];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: small ? 20 : 24,
        padding: small ? '0 6px' : '0 8px',
        borderRadius: RADIUS.pill,
        background: style.bg,
        color: style.fg,
        fontSize: small ? 11 : 12,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={small ? 11 : 12} />
      {style.label}
    </span>
  );
}

/**
 * A flag planted at a checkpoint: pole, pennant and a slow wave. The last
 * checkpoint on the route flies the chequered one.
 */
function MilestoneFlag({ chequered, reached }: { chequered?: boolean; reached?: boolean }) {
  const cloth = reached ? '#22A06B' : '#FF991F';
  return (
    <span className="lc-flag" aria-hidden>
      <svg width="30" height="46" viewBox="0 0 30 46" fill="none">
        <line x1="5" y1="2" x2="5" y2="45" stroke="#44546F" strokeWidth="2" strokeLinecap="round" />
        <circle cx="5" cy="2" r="2.2" fill="#44546F" />
        <g className="lc-flag-cloth">
          {chequered ? (
            <>
              <path d="M6 3 L26 7 L26 17 L6 13 Z" fill="#FFFFFF" stroke="#172B4D" strokeWidth="1" strokeLinejoin="round" />
              <path d="M6 3 L11 4 L11 9 L6 8 Z M16 5 L21 6 L21 11 L16 10 Z M11 9 L16 10 L16 15 L11 14 Z M21 11 L26 12 L26 17 L21 16 Z" fill="#172B4D" />
            </>
          ) : (
            <path d="M6 3 L26 8 L6 14 Z" fill={cloth} stroke={reached ? '#1F845A' : '#B65C02'} strokeWidth="1" strokeLinejoin="round" />
          )}
        </g>
      </svg>
    </span>
  );
}

const ROAD_BEND = {
  // Both ends meet the stations head on, and the middle leans out towards the
  // card that comes next, so the route snakes down the page in one smooth line.
  right: 'M30 0 C 30 30, 48 55, 40 72 C 36 82, 30 88, 30 100',
  left: 'M30 0 C 30 30, 12 55, 20 72 C 24 82, 30 88, 30 100',
};

/**
 * One stretch of road between two stations. `travelled` paints it in; `active`
 * makes the lane markings flow towards the next station. The stroke is kept off
 * the viewBox scale, so a tall row stretches the curve without fattening the road.
 */
function Road({ bend, travelled, active, color }: { bend: keyof typeof ROAD_BEND; travelled: boolean; active: boolean; color: string }) {
  const path = ROAD_BEND[bend];
  return (
    <svg className="lc-road" viewBox="0 0 60 100" preserveAspectRatio="none" aria-hidden focusable="false">
      <path d={path} className="lc-road-base" vectorEffect="non-scaling-stroke" />
      <path
        d={path}
        pathLength={1}
        className={`lc-road-fill${travelled ? ' is-travelled' : ''}${active ? ' is-active' : ''}`}
        style={{ stroke: color }}
        vectorEffect="non-scaling-stroke"
      />
      <path d={path} className={`lc-road-lane${active ? ' is-active' : ''}`} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

interface Props {
  stages: LifecycleStage[];
  currentStage: string | null;
  selectedKey: string | null;
  saving: boolean;
  members: MemberOption[];
  onSelect: (stage: LifecycleStage) => void;
  onAssign: (stage: LifecycleStage, emails: string[]) => void;
  onStateChange: (stage: LifecycleStage, state: StageState) => void;
  /** Finish this stage and start the next one still to be done. */
  onAdvance: (stage: LifecycleStage) => void;
}

/** The project's route: a station per stage, on a road that fills in as work moves. */
export function JourneyTrack({ stages, currentStage, selectedKey, saving, members, onSelect, onAssign, onStateChange, onAdvance }: Props) {
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const reached = (stage: LifecycleStage) => stage.state === 'done' || stage.state === 'skipped';
  const currentIndex = stages.findIndex((stage) => stage.key === currentStage);
  const allDone = stages.length > 0 && stages.every(reached);
  /** The next stage still to be done after this one, which is what "Start Next" starts. */
  const nextAfter = (stage: LifecycleStage) =>
    stages.slice(stages.findIndex((item) => item.key === stage.key) + 1).find((item) => !reached(item)) ?? null;

  return (
    <div>
      <ol className="lc-journey" aria-label="Project lifecycle route">
        {stages.map((stage, index) => {
          const isCurrent = stage.key === currentStage;
          const style = STATE_STYLE[stage.state];
          const Icon = STATE_ICON[stage.state];
          const hasNext = index < stages.length - 1;
          const travelled = reached(stage) || (currentIndex >= 0 && index < currentIndex);

          return (
            <li
              key={stage.key}
              className={`lc-station lc-station--${index % 2 === 0 ? 'left' : 'right'}${isCurrent ? ' is-current' : ''}`}
              style={{ ['--lc-delay' as string]: `${Math.min(index, 9) * 45}ms` }}
            >
              <div className="lc-rail">
                {stage.is_milestone && (
                  <MilestoneFlag chequered={index === stages.length - 1} reached={reached(stage)} />
                )}
                <span
                  className={`lc-node${isCurrent ? ' is-current' : ''}${reached(stage) ? ' is-done' : ''}${stage.is_milestone ? ' is-milestone' : ''}`}
                  style={{
                    background: reached(stage) || isCurrent ? style.dot : C.surface,
                    borderColor: style.dot,
                    color: reached(stage) || isCurrent ? '#FFFFFF' : style.dot,
                    ['--lc-halo' as string]: style.dot,
                  }}
                  aria-hidden
                >
                  <span className="lc-node-icon">
                    <Icon size={15} />
                  </span>
                </span>
                {hasNext && <Road bend={index % 2 === 0 ? 'right' : 'left'} travelled={travelled} active={isCurrent} color={style.dot} />}
              </div>

              <div className="lc-station-body">
                {isCurrent && <span className="lc-here">You are here</span>}
                <div
                  className={`lc-stage${stage.is_milestone ? ' is-milestone' : ''}${stage.key === selectedKey ? ' is-selected' : ''}${menuKey === stage.key ? ' is-menu-open' : ''}`}
                >
                  <button
                    type="button"
                    className="lc-stage-open"
                    aria-pressed={stage.key === selectedKey}
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-label={`${stage.name}${stage.is_milestone ? ', checkpoint' : ''}, ${style.label}. Open its details`}
                    onClick={() => onSelect(stage)}
                  />

                  <span className="lc-stage-line" style={{ display: 'flex', alignItems: 'baseline', gap: space(1), flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: 0.4, fontVariantNumeric: 'tabular-nums' }}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: -0.2 }}>{stage.name}</span>
                    {stage.codename && <CodeTag codename={stage.codename} />}
                    {stage.team && (
                      <span style={{ fontSize: 12, color: C.textMuted }}>{stage.team}</span>
                    )}
                  </span>

                  <span className="lc-stage-line" style={{ display: 'flex', alignItems: 'center', gap: space(1), flexWrap: 'wrap', width: '100%' }}>
                    <StageStateMenu
                      stageName={stage.name}
                      state={stage.state}
                      open={menuKey === stage.key}
                      disabled={saving}
                      onOpenChange={(open) => setMenuKey(open ? stage.key : null)}
                      onPick={(state) => onStateChange(stage, state)}
                    />
                    {/* Only where there is work in hand: finishing a stage nobody has
                        started is a mistake waiting to happen, and the hero offers
                        "Start" for that case. */}
                    {(stage.state === 'in_progress' || stage.state === 'blocked') && (
                      <button
                        type="button"
                        className="lc-next-btn"
                        disabled={saving}
                        title={
                          nextAfter(stage)
                            ? `Finish ${stage.name} and start ${nextAfter(stage)?.name}`
                            : `Finish ${stage.name}, the last stage`
                        }
                        aria-label={
                          nextAfter(stage)
                            ? `Finish ${stage.name} and start ${nextAfter(stage)?.name}`
                            : `Finish ${stage.name}, the last stage`
                        }
                        onClick={() => onAdvance(stage)}
                      >
                        <Check size={18} strokeWidth={3} aria-hidden />
                      </button>
                    )}
                    {stage.state !== 'not_started' && (
                      <span style={{ fontSize: 12, color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>{dayCount(stage.days)}</span>
                    )}
                    {stage.started_at && (
                      /* When it ran is the question people bring to this card, so the
                         dates are read as dates rather than as trailing grey text. */
                      <span className="lc-date">
                        <time dateTime={stage.started_at}>{format(parseISO(stage.started_at), 'd MMM')}</time>
                        {stage.completed_at && (
                          <>
                            <span aria-hidden>→</span>
                            <time dateTime={stage.completed_at}>{format(parseISO(stage.completed_at), 'd MMM')}</time>
                          </>
                        )}
                      </span>
                    )}
                    {stage.target_date && (
                      <span className={`lc-date${stage.is_overdue ? ' is-late' : ''}`}>
                        {stage.is_overdue ? 'Overdue' : 'Due'}
                        <time dateTime={stage.target_date}>{format(parseISO(stage.target_date), 'd MMM')}</time>
                      </span>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                      {(stage.remark_count > 0 || stage.attachment_count > 0) && (
                        <button
                          type="button"
                          className="lc-tally"
                          title={`${plural(stage.remark_count, 'remark')}, ${plural(stage.attachment_count, 'document')}`}
                          aria-label={`Open ${stage.name}: ${plural(stage.remark_count, 'remark')}, ${plural(stage.attachment_count, 'document')}`}
                          onClick={() => onSelect(stage)}
                        >
                          {stage.remark_count > 0 && (
                            <span><MessageSquare size={12} aria-hidden /> {stage.remark_count}</span>
                          )}
                          {stage.attachment_count > 0 && (
                            <span><Paperclip size={12} aria-hidden /> {stage.attachment_count}</span>
                          )}
                        </button>
                      )}
                      <AssigneePicker
                        stageName={stage.name}
                        assignees={stage.assignees}
                        members={members}
                        disabled={saving}
                        onChange={(emails) => onAssign(stage, emails)}
                      />
                    </span>
                  </span>
                </div>
              </div>
            </li>
          );
        })}

        <li className="lc-station lc-station--finish">
          <div className="lc-rail">
            <span className={`lc-node lc-node--finish${allDone ? ' is-done' : ''}`} aria-hidden>
              <Flag size={15} />
            </span>
          </div>
          <div className="lc-station-body">
            <span style={{ fontSize: 13, fontWeight: 600, color: allDone ? C.success : C.textMuted }}>
              {allDone ? 'Delivered' : 'Destination'}
            </span>
          </div>
        </li>
      </ol>
    </div>
  );
}
