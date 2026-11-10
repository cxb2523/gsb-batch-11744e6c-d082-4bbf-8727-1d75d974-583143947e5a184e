import { C } from './constants';

export function greet(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatLongDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function relativeTime(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function statusVisual(status: string): { color: string; bg: string } {
  const n = status.toLowerCase();
  if (['done', 'closed', 'completed', 'resolved'].includes(n)) {
    return { color: C.success, bg: C.successBg };
  }
  if (n.includes('progress') || n.includes('active') || n.includes('working') || n.includes('development')) {
    return { color: C.inProgress, bg: C.inProgressBg };
  }
  if (n.includes('blocked')) return { color: C.blocked, bg: C.blockedBg };
  if (n.includes('testing') || n.includes('qa') || n.includes('review')) {
    return { color: C.testing, bg: C.testingBg };
  }
  return { color: C.subtle, bg: C.pageBg };
}

export function priorityVisual(priority?: string): { label: string; color: string } | null {
  if (!priority) return null;
  const p = priority.toLowerCase();
  if (p === 'urgent') return { label: priority, color: C.danger };
  if (p === 'high') return { label: priority, color: C.warning };
  return null;
}
