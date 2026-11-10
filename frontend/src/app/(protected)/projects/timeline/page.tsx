'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '../../../../lib/api/client';
import { lifecycleAPI } from '../../../../lib/api/lifecycle';
import { settingsAPI } from '../../../../lib/api/settings';
import { tokens } from '../../../../design-system/tokens';
import { Select } from '@/components/ui';
import { useAuth } from '../../../../hooks/useAuth';
import { ClipboardList, X, Check } from 'lucide-react';
import {
  computeCountdown,
  formatDeadline,
  isAttention,
  URGENCY_DOT,
  URGENCY_LABEL,
  type Countdown,
  type Urgency,
} from './countdown';
import { ProjectBreakdownModal } from './ProjectBreakdownModal';

interface Owner {
  id: number;
  name: string;
  email: string;
}

interface Project {
  id: number;
  key: string;
  name: string;
  description?: string;
  visibility: string;
  created_at: string;
  deadline?: string | null;
  owner: Owner;
  member_count: number;
  status?: string;
  ticket_count?: number;
  overdue_count?: number;
  epic_count?: number;
  epic_overdue_count?: number;
  last_activity_at?: string | null;
}

type SortKey =
  | 'deadline'
  | 'name_asc'
  | 'name_desc'
  | 'activity'
  | 'tickets_desc'
  | 'tickets_asc';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'deadline', label: 'Due date (soonest first)' },
  { value: 'name_asc', label: 'Name (A–Z)' },
  { value: 'name_desc', label: 'Name (Z–A)' },
  { value: 'activity', label: 'Recent activity' },
  { value: 'tickets_desc', label: 'Tickets (most first)' },
  { value: 'tickets_asc', label: 'Tickets (fewest first)' },
];

type FilterKey = 'all' | 'no_deadline';

const FILTER_OPTIONS: Array<{ value: FilterKey; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'no_deadline', label: 'No due date' },
];

function CountdownRow({ cd }: { cd: Countdown }) {
  const numberColor = isAttention(cd.urgency)
    ? URGENCY_DOT[cd.urgency]
    : tokens.colors.semantic.text.primary;

  const units: Array<{ v: number; u: string; muted?: boolean }> = [
    { v: cd.days, u: 'd' },
    { v: cd.hours, u: 'h' },
    { v: cd.minutes, u: 'm' },
    { v: cd.seconds, u: 's', muted: true }, // seconds de-emphasised so the constant tick isn't the loudest thing
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontVariantNumeric: 'tabular-nums' }}>
      {units.map(({ v, u, muted }) => (
        <div key={u} style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: muted ? tokens.colors.semantic.text.tertiary : numberColor,
            }}
          >
            {String(v).padStart(2, '0')}
          </span>
          <span style={{ fontSize: 12, fontWeight: 500, color: tokens.colors.semantic.text.tertiary }}>
            {u}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Local YYYY-MM-DD for a Date, used for the native date input's value and its min. */
function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Admin-only inline due-date editor. Renders a small CTA; clicking it opens a popover
 * anchored to the CTA with a native date picker (min = today, so no past dates) plus
 * cancel (✕) and save (✓). Deadline is the only field this touches. All interactions
 * stop propagation so they never trigger the card's board navigation.
 */
function DueDateEditor({
  project,
  onSaved,
}: {
  project: Project;
  onSaved: (deadline: string) => void;
}) {
  const hasDeadline = !!project.deadline;
  const today = toDateInputValue(new Date());

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openEditor = (e: React.MouseEvent) => {
    e.stopPropagation();
    setValue(project.deadline ? toDateInputValue(new Date(project.deadline)) : '');
    setError(null);
    setOpen(true);
  };

  const save = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!value) {
      setError('Pick a date');
      return;
    }
    if (value < today) {
      setError('Due date cannot be in the past');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Send end-of-day ISO so the deadline lands on the chosen calendar day.
      const iso = new Date(`${value}T23:59:59`).toISOString();
      await settingsAPI.updateProjectSettings(project.id, { project_deadline: iso });
      onSaved(iso);
      setOpen(false);
    } catch {
      setError('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const iconBtn = (bg: string, border: string, color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    borderRadius: tokens.borderRadius.sm,
    background: bg,
    border: `1px solid ${border}`,
    color,
    cursor: 'pointer',
    lineHeight: 1,
    fontSize: 13,
  });

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={openEditor}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 600,
          color: tokens.colors.primary[600],
          textDecoration: 'underline',
          textUnderlineOffset: 2,
        }}
      >
        {hasDeadline ? 'Edit due date' : 'Set due date'}
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 20,
            background: tokens.colors.semantic.background.default,
            border: `1px solid ${tokens.colors.semantic.border.default}`,
            borderRadius: tokens.borderRadius.md,
            boxShadow: tokens.shadows.lg,
            padding: 12,
            width: 220,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: tokens.colors.semantic.text.secondary, letterSpacing: '0.02em' }}>
            {hasDeadline ? 'EDIT DUE DATE' : 'SET DUE DATE'}
          </div>
          <input
            type="date"
            value={value}
            min={today}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '7px 9px',
              fontSize: 13,
              border: `1px solid ${error ? tokens.colors.error[300] : tokens.colors.semantic.border.default}`,
              borderRadius: tokens.borderRadius.sm,
              outline: 'none',
              background: tokens.colors.semantic.background.default,
              color: tokens.colors.semantic.text.primary,
            }}
          />
          {error && (
            <div style={{ fontSize: 11, color: tokens.colors.error[600] }}>{error}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              aria-label="Cancel"
              title="Cancel"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              style={iconBtn(tokens.colors.semantic.background.default, tokens.colors.semantic.border.default, tokens.colors.semantic.text.secondary)}
            >
              <X size={14} />
            </button>
            <button
              type="button"
              aria-label="Save"
              title="Save"
              disabled={saving}
              onClick={save}
              style={iconBtn('#E3FCEF', '#ABF5D1', '#216E4E')}
            >
              <Check size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectTimelineCard({
  project,
  now,
  lifecycleActive,
  isAdmin,
  onDeadlineChange,
}: {
  project: Project;
  now: number;
  lifecycleActive: boolean;
  isAdmin: boolean;
  onDeadlineChange: (projectId: number, deadline: string) => void;
}) {
  const router = useRouter();
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const cd = computeCountdown(project.deadline, now);
  const attention = isAttention(cd.urgency);
  const ticketCount = project.ticket_count ?? 0;
  const overdueCount = project.overdue_count ?? 0;
  const epicCount = project.epic_count ?? 0;
  const epicOverdueCount = project.epic_overdue_count ?? 0;

  return (
    <div
      onClick={() => {
        localStorage.setItem('selectedProjectId', project.id.toString());
        router.push(`/projects/${project.id}/board`);
      }}
      style={{
        background: tokens.colors.semantic.background.default,
        border: `1px solid ${tokens.colors.semantic.border.default}`,
        borderRadius: tokens.borderRadius.lg,
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = tokens.colors.semantic.border.hover;
        e.currentTarget.style.boxShadow = tokens.shadows.sm;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = tokens.colors.semantic.border.default;
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Header: status dot + name, key on the right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: URGENCY_DOT[cd.urgency],
            flexShrink: 0,
          }}
        />
        <h3
          title={project.name}
          style={{
            flex: 1,
            minWidth: 0,
            margin: 0,
            fontSize: 15,
            fontWeight: 600,
            lineHeight: '20px',
            color: tokens.colors.semantic.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {project.name}
        </h3>
        <span
          style={{
            flexShrink: 0,
            padding: '2px 7px',
            borderRadius: tokens.borderRadius.xs,
            background: tokens.colors.semantic.background.tertiary,
            color: tokens.colors.semantic.text.tertiary,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
        >
          {project.key}
        </span>
      </div>

      {/* Countdown (the focal point) or the no-deadline placeholder.
          Fixed min-height matched to the countdown row so the footer aligns across every
          card regardless of body — no-deadline cards simply carry a little more space. */}
      <div style={{ minHeight: 28, display: 'flex', alignItems: 'center' }}>
        {cd.urgency === 'none' ? (
          <span style={{ fontSize: 14, fontWeight: 500, color: tokens.colors.semantic.text.tertiary }}>
            Due date not set
          </span>
        ) : (
          <CountdownRow cd={cd} />
        )}
      </div>

      {/* Footer: status + due date, then ticket metrics */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          paddingTop: 12,
          borderTop: `1px solid ${tokens.colors.semantic.border.default}`,
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontWeight: 600,
              color: attention ? URGENCY_DOT[cd.urgency] : tokens.colors.semantic.text.secondary,
            }}
          >
            {URGENCY_LABEL[cd.urgency]}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: tokens.colors.semantic.text.tertiary }}>
            {project.deadline && formatDeadline(project.deadline)}
            {isAdmin ? (
              <DueDateEditor project={project} onSaved={(d) => onDeadlineChange(project.id, d)} />
            ) : (
              !project.deadline && 'No deadline set'
            )}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: tokens.colors.semantic.text.tertiary }}>
          <span>
            {ticketCount} {ticketCount === 1 ? 'ticket' : 'tickets'}
          </span>
          {overdueCount > 0 && (
            <>
              <span aria-hidden style={{ color: tokens.colors.semantic.border.hover }}>·</span>
              <span style={{ color: tokens.colors.error[600], fontWeight: 600 }}>
                {overdueCount} overdue
              </span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: tokens.colors.semantic.text.tertiary }}>
          <span>
            {epicCount} {epicCount === 1 ? 'epic' : 'epics'}
          </span>
          {epicOverdueCount > 0 && (
            <>
              <span aria-hidden style={{ color: tokens.colors.semantic.border.hover }}>·</span>
              <span style={{ color: tokens.colors.error[600], fontWeight: 600 }}>
                {epicOverdueCount} overdue
              </span>
            </>
          )}
        </div>
      </div>

      {/* Lifecycle status + breakdown CTA pinned to the bottom. The slot is always
          rendered so lifecycle and non-lifecycle cards keep the same height, and the
          body and divider above it stay aligned across every card. */}
      <div style={{ minHeight: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {lifecycleActive ? (
          <span
            role="button"
            tabIndex={0}
            title="View lifecycle"
            onClick={(e) => {
              e.stopPropagation();
              localStorage.setItem('selectedProjectId', project.id.toString());
              router.push(`/projects/${project.id}/lifecycle`);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                localStorage.setItem('selectedProjectId', project.id.toString());
                router.push(`/projects/${project.id}/lifecycle`);
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '7px 14px',
              borderRadius: tokens.borderRadius.sm,
              background: tokens.colors.semantic.background.default,
              border: `1px solid ${tokens.colors.semantic.border.default}`,
              color: tokens.colors.primary[600],
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = tokens.colors.semantic.background.tertiary;
              e.currentTarget.style.borderColor = tokens.colors.semantic.border.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = tokens.colors.semantic.background.default;
              e.currentTarget.style.borderColor = tokens.colors.semantic.border.default;
            }}
          >
            Lifecycle under way
          </span>
        ) : (
          <span />
        )}

        <button
          type="button"
          title="View a full breakdown of this project's epics and tickets"
          onClick={(e) => {
            e.stopPropagation();
            setBreakdownOpen(true);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: tokens.borderRadius.sm,
            background: tokens.colors.semantic.background.default,
            border: `1px solid ${tokens.colors.semantic.border.default}`,
            color: tokens.colors.primary[600],
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = tokens.colors.semantic.background.tertiary;
            e.currentTarget.style.borderColor = tokens.colors.semantic.border.hover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = tokens.colors.semantic.background.default;
            e.currentTarget.style.borderColor = tokens.colors.semantic.border.default;
          }}
        >
          View breakdown
        </button>
      </div>

      {breakdownOpen && (
        <ProjectBreakdownModal
          project={{
            id: project.id,
            name: project.name,
            key: project.key,
            deadline: project.deadline,
            ticket_count: ticketCount,
            overdue_count: overdueCount,
            epic_count: epicCount,
            epic_overdue_count: epicOverdueCount,
          }}
          now={now}
          onClose={() => setBreakdownOpen(false)}
        />
      )}
    </div>
  );
}

export default function ProjectTimelinePage() {
  const { isAdmin } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [activeLifecycles, setActiveLifecycles] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('deadline');
  const [filter, setFilter] = useState<FilterKey>('all');
  // The card grid scrolls, not the page, so re-ordering it from a control that stays
  // pinned above would otherwise leave you mid-list looking at an unrelated row.
  const listRef = useRef<HTMLDivElement>(null);

  const scrollListToTop = () => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeadlineChange = (projectId: number, deadline: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, deadline } : p))
    );
  };

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await apiGet<Project[]>('/projects');
        setProjects(data);
      } catch (err) {
        console.error('Failed to fetch projects:', err);
        setError('Could not load projects. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();

    // Secondary: the list is useful without it, so a failure here is not an error.
    lifecycleAPI
      .activeProjects()
      .then((data) => setActiveLifecycles(new Set(data.project_ids)))
      .catch(() => setActiveLifecycles(new Set()));
  }, []);

  // Tick every second so all countdowns stay live.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const visibleProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = projects.filter((p) => {
      if (q) {
        const haystack = `${p.name} ${p.key} ${p.description ?? ''} ${p.owner?.name ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filter === 'no_deadline') return !p.deadline;
      return true;
    });

    const deadlineRank = (p: Project) =>
      p.deadline ? new Date(p.deadline).getTime() : Number.POSITIVE_INFINITY;
    const activityRank = (p: Project) =>
      p.last_activity_at ? new Date(p.last_activity_at).getTime() : 0;
    const byName = (a: Project, b: Project) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

    const sorted = [...matches];
    switch (sort) {
      case 'name_asc':
        sorted.sort(byName);
        break;
      case 'name_desc':
        sorted.sort((a, b) => byName(b, a));
        break;
      case 'activity':
        // Newest first; projects that have never been touched sink to the bottom.
        sorted.sort((a, b) => activityRank(b) - activityRank(a) || byName(a, b));
        break;
      case 'tickets_desc':
        sorted.sort((a, b) => (b.ticket_count ?? 0) - (a.ticket_count ?? 0) || byName(a, b));
        break;
      case 'tickets_asc':
        sorted.sort((a, b) => (a.ticket_count ?? 0) - (b.ticket_count ?? 0) || byName(a, b));
        break;
      default:
        // Overdue first, then nearest deadline, then projects without a deadline.
        sorted.sort((a, b) => deadlineRank(a) - deadlineRank(b) || byName(a, b));
    }
    return sorted;
  }, [projects, search, filter, sort]);

  const withoutDeadline = projects.filter((p) => !p.deadline).length;

  // With "No due date" on, every card lacks a deadline, so the due-date sort is hidden
  // rather than left as a silent no-op. The trigger is a fixed width (below) so the
  // control never resizes as options or the selected label change.
  const sortOptions = SORT_OPTIONS.filter(
    ({ value }) => !(filter === 'no_deadline' && value === 'deadline'),
  );

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 14, color: tokens.colors.semantic.text.secondary }}>Loading timeline...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 600,
            lineHeight: '30px',
            color: tokens.colors.semantic.text.primary,
            marginBottom: 4,
          }}
        >
          Project Timeline
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: tokens.colors.semantic.text.secondary }}>
          {projects.length === 0
            ? 'No projects available'
            : visibleProjects.length === projects.length
              ? `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}${withoutDeadline > 0 ? ` · ${withoutDeadline} without timeline` : ''}`
              : `${visibleProjects.length} of ${projects.length} projects`}
        </p>
      </div>

      {/* Search, filter and sort */}
      {projects.length > 0 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
          <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <circle cx="7" cy="7" r="4" stroke={tokens.colors.semantic.text.tertiary} strokeWidth="1.5" fill="none" />
              <path d="M10 10l3 3" stroke={tokens.colors.semantic.text.tertiary} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search projects by name, key, description or owner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                height: 40,
                boxSizing: 'border-box',
                padding: search ? '0 36px 0 40px' : '0 16px 0 40px',
                background: tokens.colors.semantic.background.secondary,
                border: `1px solid ${tokens.colors.semantic.border.default}`,
                borderRadius: 8,
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                color: tokens.colors.semantic.text.primary,
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.primary[500];
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.semantic.border.default;
              }}
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  padding: 2,
                  cursor: 'pointer',
                  fontSize: 13,
                  lineHeight: 1,
                  color: tokens.colors.semantic.text.tertiary,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {FILTER_OPTIONS.map(({ value, label }) => {
              const active = filter === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    // A second click on the active filter clears it, so "No due date"
                    // can be switched off without hunting for the "All" button.
                    const next = active ? 'all' : value;
                    // Sorting by due date is meaningless once every card has none, so
                    // move off it as the filter turns on (we also hide the option below).
                    if (next === 'no_deadline' && sort === 'deadline') setSort('name_asc');
                    setFilter(next);
                    scrollListToTop();
                  }}
                  style={{
                    padding: '8px 14px',
                    background: active ? tokens.colors.primary[500] : tokens.colors.semantic.background.secondary,
                    border: `1px solid ${active ? tokens.colors.primary[500] : tokens.colors.semantic.border.default}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    color: active ? tokens.colors.semantic.text.inverse : tokens.colors.semantic.text.secondary,
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 13, color: tokens.colors.semantic.text.secondary }}>Sort</span>
            <Select<SortKey>
              value={sort}
              ariaLabel="Sort projects"
              options={sortOptions}
              fullWidth={false}
              // Sized to the longest label ("Due date (soonest first)") so the control
              // holds its width no matter which option is selected or hidden.
              style={{ width: 230 }}
              onChange={(value) => {
                if (!value) return;
                setSort(value);
                scrollListToTop();
              }}
            />
          </div>
        </div>
      )}

      {error ? (
        <div
          style={{
            background: tokens.colors.error[50],
            border: `1px solid ${tokens.colors.error[200]}`,
            borderRadius: tokens.borderRadius.md,
            padding: 16,
            fontSize: 14,
            color: tokens.colors.error[700],
          }}
        >
          {error}
        </div>
      ) : projects.length === 0 ? (
        <div
          style={{
            background: tokens.colors.semantic.background.default,
            borderRadius: tokens.borderRadius.lg,
            padding: 48,
            textAlign: 'center',
            border: `1px solid ${tokens.colors.semantic.border.default}`,
          }}
        >
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center', color: tokens.colors.semantic.text.tertiary }}>
            <ClipboardList size={48} strokeWidth={1.5} />
          </div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, marginBottom: 8, color: tokens.colors.semantic.text.primary }}>
            No projects yet
          </h3>
          <p style={{ margin: 0, fontSize: 14, color: tokens.colors.semantic.text.secondary }}>
            Projects you have access to will show up here with their countdowns.
          </p>
        </div>
      ) : visibleProjects.length === 0 ? (
        <div
          style={{
            background: tokens.colors.semantic.background.default,
            borderRadius: tokens.borderRadius.lg,
            padding: 48,
            textAlign: 'center',
            border: `1px solid ${tokens.colors.semantic.border.default}`,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, marginBottom: 8, color: tokens.colors.semantic.text.primary }}>
            No projects match
          </h3>
          <p style={{ margin: 0, fontSize: 14, color: tokens.colors.semantic.text.secondary }}>
            Try a different search term or clear the filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setFilter('all');
            }}
            style={{
              marginTop: 16,
              padding: '8px 14px',
              background: tokens.colors.semantic.background.default,
              border: `1px solid ${tokens.colors.semantic.border.default}`,
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: tokens.colors.primary[600],
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingRight: 4 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: 16,
              paddingBottom: 24,
            }}
          >
            {visibleProjects.map((project) => (
              <ProjectTimelineCard
                key={project.id}
                project={project}
                now={now}
                lifecycleActive={activeLifecycles.has(project.id)}
                isAdmin={isAdmin}
                onDeadlineChange={handleDeadlineChange}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
