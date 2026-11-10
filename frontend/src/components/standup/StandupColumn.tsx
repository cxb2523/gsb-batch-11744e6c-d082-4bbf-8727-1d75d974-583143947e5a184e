'use client';

import React from 'react';
import { C, RADIUS, SHADOW, space } from './tokens';

interface Props {
  title: string;
  icon: React.ReactNode;
  count: number;
  /** Needs attention (e.g. open blockers): red icon and count badge. No coloured edges. */
  attention?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  id?: string;
  /** Set while a card is being dragged over the board. */
  drop?: DropZone;
}

export interface DropZone {
  /** 'valid' accepts the card; 'invalid' means it's already here. */
  state: 'idle' | 'valid' | 'invalid';
  message?: string;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
}

const DROP_RING = { idle: undefined, valid: `0 0 0 2px ${C.accent}`, invalid: `0 0 0 2px ${C.dangerDot}` } as const;

export function StandupColumn({ title, icon, count, attention, children, footer, id, drop }: Props) {
  return (
    <section
      className="su-col"
      aria-labelledby={id}
      onDragOver={drop?.onDragOver}
      onDragLeave={drop?.onDragLeave}
      onDrop={drop?.onDrop}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: drop?.state === 'valid' ? C.accentSoft : C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: RADIUS.lg,
        boxShadow: drop && drop.state !== 'idle' ? DROP_RING[drop.state] : SHADOW.card,
        transition: 'background-color 150ms ease, box-shadow 150ms ease',
      }}
    >
      {drop?.state === 'invalid' && drop.message && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: 52,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2,
            padding: `${space(0.5)}px ${space(1.5)}px`,
            borderRadius: RADIUS.pill,
            background: C.dangerSoft,
            color: C.danger,
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {drop.message}
        </div>
      )}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space(1),
          padding: `${space(1.5)}px ${space(2)}px`,
          borderBottom: `1px solid ${C.divider}`,
        }}
      >
        <span aria-hidden style={{ display: 'inline-flex', color: attention ? C.danger : C.textSubtle }}>{icon}</span>
        <h3 id={id} style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.text }}>{title}</h3>
        <span
          style={{
            minWidth: 20,
            height: 20,
            padding: '0 6px',
            borderRadius: RADIUS.pill,
            background: attention ? C.dangerSoft : C.surfaceSunken,
            color: attention ? C.danger : C.textSubtle,
            fontSize: 12,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {count}
        </span>
      </header>
      <div className="su-col-body" style={{ display: 'flex', flexDirection: 'column', padding: space(1), gap: space(0.5), flex: 1, minHeight: 0 }}>{children}</div>
      {footer && <div style={{ padding: `0 ${space(1)}px ${space(1)}px` }}>{footer}</div>}
    </section>
  );
}

/** Heading for one project's tickets inside a column. */
export function ProjectGroupHeading({ name, projectKey, color, count }: { name: string; projectKey?: string; color?: string; count: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space(1),
        padding: `${space(1.5)}px ${space(1)}px ${space(0.5)}px`,
        fontSize: 12,
        fontWeight: 600,
        color: C.textBody,
        minWidth: 0,
      }}
    >
      {color && <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</span>
      {projectKey && <span style={{ color: C.textMuted, fontWeight: 500 }}>{projectKey}</span>}
      <span style={{ marginLeft: 'auto', color: C.textMuted, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    </div>
  );
}

export function ColumnEmpty({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: space(1),
        padding: `${space(4)}px ${space(2)}px`,
      }}
    >
      <span aria-hidden style={{ display: 'inline-flex', color: C.textMuted }}>{icon}</span>
      <div style={{ fontSize: 14, fontWeight: 500, color: C.textBody }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: C.textMuted, maxWidth: 260, lineHeight: 1.5 }}>{hint}</div>}
      {action}
    </div>
  );
}
