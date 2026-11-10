/**
 * Visual tokens for the lifecycle screen.
 *
 * Deliberately the same palette, spacing and motion as the standup board, so the
 * two newest screens read as one product. They live in the standup folder today;
 * re-exporting here means a later move to the design system touches one file.
 */
export { C, CATEGORY_STYLE, FONT_MONO, IST_TIME, LAYER, MOTION, RADIUS, SHADOW, VISUALLY_HIDDEN, focusRing, plural, space } from '@/components/standup/tokens';

import type { StageState } from '@/lib/api/lifecycle';
import { C } from '@/components/standup/tokens';

/** One look per stage state: colour is never the only signal, every chip has its label. */
export const STATE_STYLE: Record<StageState, { label: string; bg: string; fg: string; dot: string }> = {
  not_started: { label: 'Not started', bg: '#F1F2F4', fg: '#44546F', dot: '#8590A2' },
  in_progress: { label: 'In progress', bg: '#E9F2FF', fg: '#0055CC', dot: '#1D7AFC' },
  done: { label: 'Done', bg: '#E3FCEF', fg: '#216E4E', dot: '#22A06B' },
  blocked: { label: 'Blocked', bg: C.dangerSoft, fg: C.danger, dot: C.dangerDot },
  skipped: { label: 'Skipped', bg: '#F1F2F4', fg: '#6B778C', dot: '#C1C7D0' },
};

export const STATE_ORDER: StageState[] = ['not_started', 'in_progress', 'done', 'blocked', 'skipped'];

/** "3 days", "1 day", "Today": a stage that started today has no days yet. */
export function dayCount(days: number): string {
  if (days <= 0) return 'Today';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
