'use client';

/**
 * Shared chrome for the report screens.
 *
 * Every report page used to hand-roll its own shell: a tinted page gradient, a
 * 30px display heading, 12px cards with drop shadows and 48px gradient icon
 * tiles with coloured glows. None of that exists anywhere else in the app — the
 * reports index, settings and board screens are flat white cards with
 * neutral[200] hairlines on a neutral[50] page. These primitives are that
 * second look, so the report pages stop being the odd ones out.
 */

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, LucideIcon } from 'lucide-react';
import { tokens } from '@/design-system/tokens';

/** White card with a hairline border — the surface used across the app. */
export const surface: React.CSSProperties = {
  background: tokens.colors.semantic.background.default,
  border: `1px solid ${tokens.colors.neutral[200]}`,
  borderRadius: 8,
};

export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'purple' | 'neutral';

/** Subtle tinted chips, replacing the saturated gradient tiles with glows. */
export const toneStyles: Record<Tone, { bg: string; fg: string }> = {
  primary: { bg: tokens.colors.primary[50], fg: tokens.colors.primary[500] },
  success: { bg: tokens.colors.success[50], fg: tokens.colors.success[600] },
  warning: { bg: tokens.colors.warning[50], fg: tokens.colors.warning[600] },
  danger: { bg: tokens.colors.error[50], fg: tokens.colors.error[600] },
  purple: { bg: '#F5F3FF', fg: '#7C3AED' },
  neutral: { bg: tokens.colors.neutral[100], fg: tokens.colors.neutral[600] },
};

export function ReportPage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: tokens.colors.neutral[50],
        fontFamily: tokens.fontFamily.sans,
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px' }}>{children}</div>
    </div>
  );
}

export function ReportHeader({
  backHref,
  title,
  description,
  actions,
}: {
  backHref: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <Link
        href={backHref}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          fontWeight: 500,
          color: tokens.colors.neutral[600],
          textDecoration: 'none',
          marginBottom: 16,
        }}
      >
        <ArrowLeft size={14} />
        Back to Reports
      </Link>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: tokens.colors.neutral[900], margin: 0 }}>
            {title}
          </h1>
          <p style={{ fontSize: 14, color: tokens.colors.neutral[600], margin: '6px 0 0' }}>
            {description}
          </p>
        </div>
        {actions}
      </div>
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'primary',
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  tone?: Tone;
}) {
  const { bg, fg } = toneStyles[tone];
  return (
    <div style={{ ...surface, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div
        style={{
          width: 36,
          height: 36,
          flexShrink: 0,
          borderRadius: 8,
          background: bg,
          color: fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={18} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: tokens.colors.neutral[600], marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 600, color: tokens.colors.neutral[900], lineHeight: '28px' }}>
          {value}
        </div>
      </div>
    </div>
  );
}

/**
 * Card wrapper with an optional title/subtitle strip above the body.
 *
 * `flush` is for bodies that should reach the card's edges — a table, say —
 * where the header keeps its own padding and the body gets none.
 */
export const ReportCard = React.forwardRef<
  HTMLDivElement,
  {
    title?: string;
    subtitle?: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
    flush?: boolean;
  }
>(function ReportCard({ title, subtitle, children, style, flush = false }, ref) {
  return (
    <div
      ref={ref}
      style={{ ...surface, padding: flush ? 0 : 24, overflow: flush ? 'hidden' : undefined, ...style }}
    >
      {title && (
        <div
          style={{
            padding: flush ? '16px 20px' : undefined,
            marginBottom: flush ? 0 : 20,
            paddingBottom: flush ? 16 : 16,
            borderBottom: `1px solid ${tokens.colors.neutral[200]}`,
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, color: tokens.colors.neutral[900], margin: 0 }}>
            {title}
          </h3>
          {subtitle && (
            <p style={{ fontSize: 13, color: tokens.colors.neutral[600], margin: '4px 0 0' }}>{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
});

/**
 * The "how to read this chart" panel. The bullets used to be bare "•" glyphs
 * styled as text, which sat on their own baseline and never lined up with the
 * wrapped lines next to them; these are fixed-size dots on a flex row instead.
 */
export function ReportLegend({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: LucideIcon;
  items: React.ReactNode[];
}) {
  return (
    <div style={{ ...surface, padding: 20, background: tokens.colors.neutral[50] }}>
      <h4
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: tokens.colors.neutral[900],
          margin: '0 0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Icon size={15} color={tokens.colors.primary[500]} />
        {title}
      </h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              gap: 10,
              fontSize: 13,
              lineHeight: '20px',
              color: tokens.colors.neutral[700],
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: tokens.colors.neutral[400],
                flexShrink: 0,
                marginTop: 7,
              }}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Centred state (loading / error / empty) used inside a chart card. */
export function ReportState({
  icon: Icon,
  title,
  description,
  tone = 'neutral',
  spinner = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  tone?: Tone;
  spinner?: boolean;
}) {
  const { bg, fg } = toneStyles[tone];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 360 }}>
      <div style={{ textAlign: 'center' }}>
        {spinner && (
          <div
            style={{
              width: 32,
              height: 32,
              border: `3px solid ${tokens.colors.neutral[200]}`,
              borderTopColor: tokens.colors.primary[500],
              borderRadius: '50%',
              animation: 'report-spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }}
          />
        )}
        {!spinner && Icon && (
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: bg,
              color: fg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
            }}
          >
            <Icon size={22} />
          </div>
        )}
        <p style={{ fontSize: 14, fontWeight: 600, color: tokens.colors.neutral[900], margin: 0 }}>{title}</p>
        {description && (
          <p style={{ fontSize: 13, color: tokens.colors.neutral[600], margin: '4px 0 0' }}>{description}</p>
        )}
      </div>
      <style jsx global>{`
        @keyframes report-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
