import { tokens } from '../../../../design-system/tokens';

export type Urgency = 'none' | 'overdue' | 'critical' | 'warning' | 'normal';

export interface Countdown {
  urgency: Urgency;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  diffMs: number; // signed: positive = time remaining, negative = overdue
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function computeCountdown(deadline: string | null | undefined, now: number): Countdown {
  if (!deadline) {
    return { urgency: 'none', days: 0, hours: 0, minutes: 0, seconds: 0, diffMs: 0 };
  }

  const deadlineMs = new Date(deadline).getTime();
  const diffMs = deadlineMs - now;
  const totalSeconds = Math.floor(Math.abs(diffMs) / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let urgency: Urgency;
  if (diffMs <= 0) urgency = 'overdue';
  else if (diffMs < DAY_MS) urgency = 'critical';
  else if (diffMs < 7 * DAY_MS) urgency = 'warning';
  else urgency = 'normal';

  return { urgency, days, hours, minutes, seconds, diffMs };
}

// Colour is used sparingly — only as a small status dot, and (for the two states that
// genuinely need attention) on the countdown digits. Everything else stays neutral so
// the numbers, not the chrome, carry the meaning.
export const URGENCY_DOT: Record<Urgency, string> = {
  normal: tokens.colors.success[500],
  warning: tokens.colors.warning[500],
  critical: tokens.colors.error[500],
  overdue: tokens.colors.error[600],
  none: tokens.colors.neutral[400],
};

export const URGENCY_LABEL: Record<Urgency, string> = {
  normal: 'On track',
  warning: 'Due soon',
  critical: 'Due within 24h',
  overdue: 'Overdue',
  none: 'No deadline',
};

// Only overdue / critical get a coloured label + coloured digits; the rest read calm.
export function isAttention(u: Urgency): boolean {
  return u === 'overdue' || u === 'critical';
}

export function formatDeadline(deadline: string): string {
  return new Date(deadline).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
