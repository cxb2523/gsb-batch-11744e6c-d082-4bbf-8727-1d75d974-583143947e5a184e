/**
 * Single source of truth for painting a workflow status anywhere in the app.
 *
 * A status's configured hex `color` is the truth: `statusChipStyle` tints it into a
 * consistent chip (background / text / dot) so the board, the breakdown modal, the epic
 * modal and search all show the same colour for the same status. `category` is used only
 * as a fallback palette when a status has no usable colour, and for logic elsewhere.
 *
 * Prefer the backend-provided `status_category` on payloads; `categorize()` here mirrors
 * `backend/app/services/status_category.py` for the name-only fallback.
 */

export type StatusCategory = 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done';

/** Fallback palette (mirrors components/standup/tokens.ts) used when a status has no colour. */
export const CATEGORY_STYLE: Record<StatusCategory, { bg: string; fg: string; dot: string; label: string }> = {
  todo: { bg: '#F1F2F4', fg: '#44546F', dot: '#8590A2', label: 'To do' },
  in_progress: { bg: '#E9F2FF', fg: '#0055CC', dot: '#1D7AFC', label: 'In progress' },
  in_review: { bg: '#F3F0FF', fg: '#5E4DB2', dot: '#8F7EE7', label: 'In review' },
  blocked: { bg: '#FFECEB', fg: '#AE2E24', dot: '#E34935', label: 'Blocked' },
  done: { bg: '#DCFFF1', fg: '#216E4E', dot: '#22A06B', label: 'Done' },
};

const DONE_NAMES = new Set(['done', 'completed', 'complete', 'closed', 'resolved', 'released', 'shipped']);
const BLOCKED_HINTS = ['block', 'on hold', 'waiting', 'stuck'];
const REVIEW_HINTS = ['test', 'qa', 'review', 'verify', 'uat', 'staging'];
const PROGRESS_HINTS = ['progress', 'doing', 'develop', 'active', 'working', 'wip'];

/** Derive a category from a status name. Fallback only — prefer the payload's status_category. */
export function categorize(name?: string | null): StatusCategory {
  const n = (name || '').trim().toLowerCase();
  if (DONE_NAMES.has(n) || n.startsWith('done')) return 'done';
  if (BLOCKED_HINTS.some((h) => n.includes(h))) return 'blocked';
  if (REVIEW_HINTS.some((h) => n.includes(h))) return 'in_review';
  if (PROGRESS_HINTS.some((h) => n.includes(h))) return 'in_progress';
  return 'todo';
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!HEX_RE.test(hex)) return null;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const int = parseInt(h, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/** rgba() string from a hex colour; the codebase otherwise fakes this with hex suffixes. */
export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** WCAG relative luminance (0 = black, 1 = white) — used to keep chip text readable. */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const srgb = [rgb.r, rgb.g, rgb.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.2126 * srgb[2];
}

export interface StatusChipStyle {
  bg: string;
  fg: string;
  dot: string;
  border: string;
}

/**
 * Resolve a status's chip colours. Uses the configured `color` when present (tinted for
 * the background, the colour itself for the dot, and a readable text colour); otherwise
 * falls back to the category palette keyed by `category ?? categorize(name)`.
 */
export function statusChipStyle(input: {
  color?: string | null;
  name?: string | null;
  category?: StatusCategory | string | null;
}): StatusChipStyle {
  const { color, name, category } = input;

  if (color && HEX_RE.test(color)) {
    // Pale colours would be unreadable as text on a near-white tint, so fall back to a
    // dark neutral for those; darker colours read fine as their own text colour.
    const fg = relativeLuminance(color) > 0.6 ? '#172B4D' : color;
    return {
      bg: hexToRgba(color, 0.12),
      fg,
      dot: color,
      border: hexToRgba(color, 0.3),
    };
  }

  const cat = (category as StatusCategory) in CATEGORY_STYLE ? (category as StatusCategory) : categorize(name);
  const style = CATEGORY_STYLE[cat];
  return { bg: style.bg, fg: style.fg, dot: style.dot, border: hexToRgba(style.dot, 0.3) };
}
