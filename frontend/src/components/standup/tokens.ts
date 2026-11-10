import type { PersonHealth, StatusCategory } from '@/lib/api/standup';

/**
 * Visual tokens for the standup screen.
 *
 * Neutrals and the single accent match the rest of GRID (dashboard, board), so this
 * section reads as the same product. Semantic colours are only used for state.
 * Text colours were chosen for ≥4.5:1 contrast on the white and #F7F8F9 surfaces.
 */
export const C = {
  page: '#F7F8F9',
  surface: '#FFFFFF',
  surfaceSunken: '#F4F5F7',
  border: '#E4E6EA',
  borderStrong: '#DFE1E6',
  divider: '#EBECF0',

  text: '#172B4D',
  textBody: '#42526E',
  textSubtle: '#5E6C84',
  textMuted: '#6B778C',
  textDisabled: '#A5ADBA',

  accent: '#0052CC',
  accentHover: '#0747A6',
  accentSoft: '#E9F2FF',
  accentSoftBorder: '#CCE0FF',
  focus: '#4C9AFF',

  success: '#006644',
  successSoft: '#E3FCEF',
  warning: '#974F0C',
  warningSoft: '#FFF7E6',
  warningDot: '#FF991F',
  danger: '#AE2E24',
  dangerSoft: '#FFECEB',
  dangerDot: '#E34935',
} as const;

/** 8px spacing scale: space(1) = 8px, space(0.5) = 4px. */
export const space = (steps: number) => steps * 8;

export const RADIUS = { sm: 4, md: 6, lg: 8, xl: 12, pill: 999 } as const;

export const SHADOW = {
  card: '0 1px 2px rgba(9, 30, 66, 0.08)',
  raised: '0 4px 12px rgba(9, 30, 66, 0.12)',
  overlay: '0 12px 32px rgba(9, 30, 66, 0.24)',
} as const;

export const MOTION = { fast: '150ms ease', base: '200ms ease' } as const;

/** Layering for this screen, above the page and below the app's modal layer (9999). */
export const LAYER = { sticky: 20, popover: 1000 } as const;

export const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export const focusRing = `0 0 0 2px ${C.focus}`;

/** Fixed status-category mapping, used for every status pill on the screen. */
export const CATEGORY_STYLE: Record<StatusCategory, { bg: string; fg: string; dot: string; label: string }> = {
  todo: { bg: '#F1F2F4', fg: '#44546F', dot: '#8590A2', label: 'To do' },
  in_progress: { bg: '#E9F2FF', fg: '#0055CC', dot: '#1D7AFC', label: 'In progress' },
  in_review: { bg: '#F3F0FF', fg: '#5E4DB2', dot: '#8F7EE7', label: 'In review' },
  blocked: { bg: '#FFECEB', fg: '#AE2E24', dot: '#E34935', label: 'Blocked' },
  done: { bg: '#DCFFF1', fg: '#216E4E', dot: '#22A06B', label: 'Done' },
};


export const HEALTH_STYLE: Record<PersonHealth, { dot: string; label: string }> = {
  blocked: { dot: C.dangerDot, label: 'Has blockers' },
  no_update: { dot: C.warningDot, label: 'No update' },
  ok: { dot: '#22A06B', label: 'On track' },
};

/** "1h 30m", "45m" */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Backgrounds for work that appears in both Yesterday and Today. Each pair on a
 * person's board takes the next colour, so two pairs are never the same. Kept
 * pale enough for #172B4D body text to stay above 4.5:1.
 */
export const LINK_COLORS: { bg: string; ring: string }[] = [
  { bg: '#E9F2FF', ring: '#85B8FF' },
  { bg: '#E3FCEF', ring: '#7EE2B8' },
  { bg: '#F3F0FF', ring: '#B8ACF6' },
  { bg: '#FFF7E6', ring: '#FEC57B' },
  { bg: '#E7F9FF', ring: '#8BDBE5' },
  { bg: '#FFECF2', ring: '#F797BE' },
];

/** Hides a label visually while keeping it for screen readers. */
export const VISUALLY_HIDDEN: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/** Clock time in IST, matching the "Times in IST" note in the header. */
export const IST_TIME = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
