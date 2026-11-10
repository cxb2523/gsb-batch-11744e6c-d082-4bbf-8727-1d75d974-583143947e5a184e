import React from 'react';
import { C, CARD } from './constants';

export function SectionCard({
  id,
  icon,
  title,
  count,
  accent,
  empty,
  children,
  action,
}: {
  id?: string;
  icon: React.ReactNode;
  title: string;
  count?: number;
  accent?: string;
  empty?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const isEmpty = count === 0;
  return (
    <section
      id={id}
      style={{
        ...CARD,
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: isEmpty ? 'none' : `1px solid ${C.borderSubtle}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', color: accent ?? C.muted }}>{icon}</div>
        <h2
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: C.heading,
            letterSpacing: 0,
            flex: 1,
          }}
        >
          {title}
          {count !== undefined && (
            <span style={{ marginLeft: 8, color: C.muted, fontWeight: 500 }}>{count}</span>
          )}
        </h2>
        {action}
      </div>
      {isEmpty ? (
        <div
          style={{
            padding: '14px 16px',
            fontSize: 13,
            color: C.muted,
          }}
        >
          {empty ?? 'Nothing here.'}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export function SubGroup({
  label,
  accent,
  count,
  children,
}: {
  label: string;
  accent: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          padding: '8px 16px',
          background: C.pageBg,
          borderBottom: `1px solid ${C.borderSubtle}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: accent,
            display: 'inline-block',
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.muted,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 12, color: C.muted }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

export function StatChip({
  icon,
  label,
  value,
  valueColor,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  valueColor: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px 6px 0',
        marginRight: 16,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        color: C.subtle,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = C.heading;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = C.subtle;
      }}
    >
      <span style={{ color: valueColor, display: 'inline-flex', alignItems: 'center' }}>{icon}</span>
      <span style={{ fontWeight: 600, color: valueColor }}>{value}</span>
      <span>{label}</span>
    </button>
  );
}

export function StatRow({
  label,
  value,
  color,
  last,
}: {
  label: string;
  value: number | string;
  color: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: last ? 'none' : `1px solid ${C.borderSubtle}`,
      }}
    >
      <span style={{ fontSize: 13, color: C.body }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}
