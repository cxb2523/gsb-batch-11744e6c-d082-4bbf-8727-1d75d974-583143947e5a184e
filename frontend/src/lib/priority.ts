/**
 * Single source of truth for ticket/issue priority on the frontend.
 *
 * The app standardises on four priorities — Urgent, High, Medium, Low.
 * Legacy P0/P1/P2 data (p0→urgent, p1→high, p2→medium) is normalized on read so
 * anything not yet migrated still renders correctly.
 */

export const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

// Lower rank = more severe (for sorting).
export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const LEGACY: Record<string, Priority> = {
  p0: 'urgent',
  p1: 'high',
  p2: 'medium',
  highest: 'urgent',
  critical: 'urgent',
  normal: 'medium',
};

/** Coerce any value (legacy, mis-cased, unknown) to a canonical priority, or null when empty. */
export function normalizePriority(value?: string | null): Priority | null {
  if (!value) return null;
  const k = String(value).trim().toLowerCase();
  if (!k) return null;
  if ((PRIORITIES as readonly string[]).includes(k)) return k as Priority;
  return LEGACY[k] ?? 'medium';
}

/** Dropdown options, ordered most → least severe. */
export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = PRIORITIES.map((p) => ({
  value: p,
  label: PRIORITY_LABELS[p],
}));

// Badge palette (background / text / border).
export const PRIORITY_BADGE: Record<Priority, { bg: string; text: string; border: string }> = {
  urgent: { bg: '#FFEBE6', text: '#BF2600', border: '#FFBDAD' },
  high: { bg: '#FFF0B3', text: '#974F0C', border: '#FFE380' },
  medium: { bg: '#DEEBFF', text: '#0747A6', border: '#B3D4FF' },
  low: { bg: '#E3FCEF', text: '#006644', border: '#ABF5D1' },
};

// Single accent hex per priority (dots, left borders, etc.).
export const PRIORITY_COLOR: Record<Priority, string> = {
  urgent: '#E34935',
  high: '#FF8B00',
  medium: '#0052CC',
  low: '#36B37E',
};

const NEUTRAL_BADGE = { bg: '#F4F5F7', text: '#5E6C84', border: '#DFE1E6' };

export function priorityBadge(value?: string | null) {
  const p = normalizePriority(value);
  return p ? PRIORITY_BADGE[p] : NEUTRAL_BADGE;
}

export function priorityColor(value?: string | null) {
  const p = normalizePriority(value);
  return p ? PRIORITY_COLOR[p] : '#8993A4';
}

export function priorityLabel(value?: string | null) {
  const p = normalizePriority(value);
  return p ? PRIORITY_LABELS[p] : value ?? '';
}

export function priorityRank(value?: string | null) {
  const p = normalizePriority(value);
  return p ? PRIORITY_RANK[p] : 99;
}
