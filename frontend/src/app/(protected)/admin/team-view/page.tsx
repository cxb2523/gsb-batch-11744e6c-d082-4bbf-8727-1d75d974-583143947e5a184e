'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet } from '@/lib/api/client';
import { priorityBadge, priorityLabel } from '@/lib/priority';
import { tokens } from '@/design-system/tokens';
import TicketDetailModal from '@/components/TicketDetailModal';
import {
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  X,
  Users,
  Ticket,
  Clock,
  AlertCircle,
  Filter,
} from 'lucide-react';

interface MemberTicket {
  id: number;
  project_id: number;
  project_name: string;
  key: string;
  title: string;
  priority: string | null;
  due_date: string | null;
  status: string | null;
}

interface TeamMemberView {
  user_id: number;
  user_name: string;
  user_email: string;
  ticket_count: number;
}

interface TeamViewSummary {
  total_members: number;
  total_tickets: number;
  overdue_tickets: number;
}

interface StatusOption { id: number; name: string; }
interface MemberOption { id: number; name: string; }

interface TeamViewFilterOptions {
  priorities: string[];
  statuses: StatusOption[];
  members: MemberOption[];
}

interface TeamViewResponse {
  items: TeamMemberView[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  summary: TeamViewSummary;
  filter_options: TeamViewFilterOptions;
}

interface MemberTicketsResponse {
  items: MemberTicket[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

interface ProjectSummary {
  id: number;
  key: string;
  name: string;
}

type SortField = 'ticket' | 'title' | 'project' | 'priority' | 'status' | 'due';
type SortOrder = 'asc' | 'desc';

const MEMBER_PAGE_SIZE = 10;
const TICKETS_PAGE_SIZE = 20;


const DUE_OPTIONS = [
  { value: 'all', label: 'All Due Dates' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'dueToday', label: 'Due Today' },
  { value: 'dueSoon', label: 'Due Soon' },
  { value: 'noDueDate', label: 'No Due Date' },
];

// Fixed column widths keep the header sort controls on exactly the same pixel
// regardless of the values below them (the table uses table-layout: fixed).
const COLUMNS: { field: SortField; label: string; width: string }[] = [
  { field: 'ticket', label: 'Ticket', width: '120px' },
  { field: 'title', label: 'Title', width: 'auto' },
  { field: 'project', label: 'Project', width: '170px' },
  { field: 'priority', label: 'Priority', width: '120px' },
  { field: 'status', label: 'Status', width: '150px' },
  { field: 'due', label: 'Due Date', width: '170px' },
];

// Shared truncation so long cell values clip instead of widening a column.
const cellTruncate: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

interface DropdownOption { value: string; label: string; }

/** Self-contained filter dropdown (own open state + click-outside). */
function FilterDropdown({ value, options, onChange }: { value: string; options: DropdownOption[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', padding: `${tokens.spacing[2]} ${tokens.spacing[3]}`,
          border: `1px solid ${tokens.colors.neutral[300]}`, borderRadius: tokens.borderRadius.md,
          fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.primary,
          backgroundColor: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', textAlign: 'left',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.label}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: tokens.spacing[1],
            background: '#ffffff', border: `1px solid ${tokens.colors.neutral[200]}`, borderRadius: tokens.borderRadius.md,
            boxShadow: tokens.shadows.lg, zIndex: 1000, maxHeight: '220px', overflowY: 'auto',
          }}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <div
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  padding: `${tokens.spacing[2]} ${tokens.spacing[3]}`, cursor: 'pointer',
                  fontSize: tokens.typography.sizes.sm,
                  color: selected ? tokens.colors.primary[600] : tokens.colors.semantic.text.primary,
                  backgroundColor: selected ? tokens.colors.primary[50] : 'transparent',
                }}
                onMouseEnter={(e) => { if (!selected) e.currentTarget.style.backgroundColor = tokens.colors.neutral[50]; }}
                onMouseLeave={(e) => { if (!selected) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                {o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: tokens.spacing[3], textAlign: 'left', fontSize: tokens.typography.sizes.xs,
  fontWeight: tokens.typography.weights.semibold, color: tokens.colors.semantic.text.secondary,
  textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${tokens.colors.neutral[200]}`,
  cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
};

function SortableHeader({
  field, label, sortField, sortOrder, onSort,
}: {
  field: SortField; label: string; sortField: SortField; sortOrder: SortOrder; onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <th style={thStyle} onClick={() => onSort(field)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {active ? (
          sortOrder === 'asc' ? <ChevronUp size={13} color={tokens.colors.primary[600]} /> : <ChevronDown size={13} color={tokens.colors.primary[600]} />
        ) : (
          <ChevronsUpDown size={13} color={tokens.colors.neutral[400]} />
        )}
      </span>
    </th>
  );
}

interface MemberTicketState { tickets: MemberTicket[]; total: number; loading: boolean; }

export default function TeamViewPage() {
  const [members, setMembers] = useState<TeamMemberView[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [summary, setSummary] = useState<TeamViewSummary>({ total_members: 0, total_tickets: 0, overdue_tickets: 0 });
  const [filterOptions, setFilterOptions] = useState<TeamViewFilterOptions>({ priorities: [], statuses: [], members: [] });
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  // Per-member expand state + lazily-loaded tickets.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [memberTickets, setMemberTickets] = useState<Record<number, MemberTicketState>>({});
  // Cache loaded tickets by member + sort + filters, so toggling sort (or collapsing and
  // re-expanding) reuses results instead of refetching. Cleared when filters/page change.
  const ticketCache = useRef<Map<string, { tickets: MemberTicket[]; total: number }>>(new Map());

  // Global table sort (applies to every member's ticket list, server-side).
  const [sortField, setSortField] = useState<SortField>('due');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Filters (server-side).
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState('all');
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedDueDate, setSelectedDueDate] = useState('all');

  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const setFilter = (setter: (v: string) => void) => (value: string) => { setter(value); setOffset(0); };

  const buildQuery = useCallback(
    (extra: Record<string, string | number>) => {
      const p = new URLSearchParams();
      if (debouncedSearch.trim()) p.set('search', debouncedSearch.trim());
      if (selectedMember !== 'all') p.set('member_id', selectedMember);
      if (selectedProject !== 'all') p.set('project_id', selectedProject);
      if (selectedPriority !== 'all') p.set('priority', selectedPriority);
      if (selectedStatus !== 'all') p.set('status_id', selectedStatus);
      if (selectedDueDate !== 'all') p.set('due', selectedDueDate);
      Object.entries(extra).forEach(([k, v]) => p.set(k, String(v)));
      return p.toString();
    },
    [debouncedSearch, selectedMember, selectedProject, selectedPriority, selectedStatus, selectedDueDate],
  );

  const fetchTeamView = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const qs = buildQuery({ limit: MEMBER_PAGE_SIZE, offset });
      const data = await apiGet<TeamViewResponse>(`/admin/team-view?${qs}`);
      setMembers(data.items);
      setTotal(data.total);
      setHasMore(data.has_more);
      setSummary(data.summary);
      setFilterOptions(data.filter_options);
      // A fresh member page collapses everyone and drops any loaded/cached tickets.
      setExpanded(new Set());
      setMemberTickets({});
      ticketCache.current.clear();
    } catch (err) {
      console.error('Failed to fetch team view:', err);
      setError('Failed to load team view. Please try again.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [buildQuery, offset]);

  const fetchProjects = async () => {
    try {
      setProjects(await apiGet<ProjectSummary[]>('/projects'));
    } catch (err) {
      console.error('Failed to fetch projects for team view:', err);
    }
  };

  // The filter signature (no limit/offset/sort) — part of each cache key.
  const filterKey = buildQuery({});
  const cacheKey = (userId: number) => `${userId}|${sortField}|${sortOrder}|${filterKey}`;

  const loadMember = async (userId: number, mode: 'first' | 'more') => {
    const key = cacheKey(userId);
    if (mode === 'first') {
      const cached = ticketCache.current.get(key);
      if (cached) {
        // Instant: we've already loaded this member for this sort+filters.
        setMemberTickets((s) => ({ ...s, [userId]: { tickets: cached.tickets, total: cached.total, loading: false } }));
        return;
      }
    }
    const prev = memberTickets[userId]?.tickets ?? [];
    const offset = mode === 'more' ? prev.length : 0;
    // Keep existing rows visible while loading (mark loading) so nothing flickers.
    setMemberTickets((s) => ({ ...s, [userId]: { tickets: s[userId]?.tickets ?? [], total: s[userId]?.total ?? 0, loading: true } }));
    try {
      const qs = buildQuery({ limit: TICKETS_PAGE_SIZE, offset, sort: sortField, order: sortOrder });
      const data = await apiGet<MemberTicketsResponse>(`/admin/team-view/members/${userId}/tickets?${qs}`);
      const tickets = mode === 'more' ? [...prev, ...data.items] : data.items;
      ticketCache.current.set(key, { tickets, total: data.total });
      setMemberTickets((s) => ({ ...s, [userId]: { tickets, total: data.total, loading: false } }));
    } catch (err) {
      console.error('Failed to load member tickets:', err);
      setMemberTickets((s) => ({ ...s, [userId]: { tickets: s[userId]?.tickets ?? [], total: s[userId]?.total ?? 0, loading: false } }));
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  // Refetch members when filters or the member page change.
  useEffect(() => { fetchTeamView(); }, [fetchTeamView]);

  // Scroll back to the top of the content area when the member page changes.
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [offset]);

  // Changing the sort re-sorts every expanded member (served from cache when possible).
  useEffect(() => {
    expanded.forEach((id) => loadMember(id, 'first'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortField, sortOrder]);

  const toggleExpand = (userId: number) => {
    const isOpen = expanded.has(userId);
    const next = new Set(expanded);
    if (isOpen) next.delete(userId);
    else next.add(userId);
    setExpanded(next);
    if (!isOpen) loadMember(userId, 'first');
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortOrder('asc'); }
  };

  const handleTicketClick = (ticket: MemberTicket) => {
    setSelectedTicketId(ticket.id);
    setSelectedProjectId(ticket.project_id);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '-';
    }
  };

  const getPriorityColor = (priority: string | null) => priorityBadge(priority);

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    try {
      const date = new Date(dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return date < today;
    } catch {
      return false;
    }
  };

  const memberOptions: DropdownOption[] = [
    { value: 'all', label: 'All Members' },
    ...filterOptions.members.map((m) => ({ value: String(m.id), label: m.name })),
  ];
  const projectOptions: DropdownOption[] = [
    { value: 'all', label: 'All Projects' },
    ...projects.map((p) => ({ value: String(p.id), label: p.name })),
  ];
  const priorityOptions: DropdownOption[] = [
    { value: 'all', label: 'All Priorities' },
    ...filterOptions.priorities.map((p) => ({ value: p, label: priorityLabel(p) })),
  ];
  const statusOptions: DropdownOption[] = [
    { value: 'all', label: 'All Statuses' },
    ...filterOptions.statuses.map((s) => ({ value: String(s.id), label: s.name })),
  ];

  const hasActiveFilters =
    !!searchQuery || selectedMember !== 'all' || selectedProject !== 'all' ||
    selectedPriority !== 'all' || selectedStatus !== 'all' || selectedDueDate !== 'all';

  const clearAll = () => {
    setSearchQuery(''); setSelectedMember('all'); setSelectedProject('all');
    setSelectedPriority('all'); setSelectedStatus('all'); setSelectedDueDate('all'); setOffset(0);
  };

  const labelFor = (options: DropdownOption[], value: string) => options.find((o) => o.value === value)?.label ?? value;

  const avgTicketsPerMember = summary.total_members > 0 ? (summary.total_tickets / summary.total_members).toFixed(1) : '0';
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + MEMBER_PAGE_SIZE, total);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontFamily: tokens.fontFamily.sans }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: `3px solid ${tokens.colors.neutral[200]}`, borderTopColor: tokens.colors.primary[500], borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: tokens.colors.semantic.text.secondary, fontSize: tokens.typography.sizes.sm }}>Loading team view...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontFamily: tokens.fontFamily.sans }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <AlertCircle size={48} color={tokens.colors.error[500]} style={{ marginBottom: tokens.spacing[4] }} />
          <p style={{ color: tokens.colors.error[600], fontSize: tokens.typography.sizes.base }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: tokens.spacing[8], fontFamily: tokens.fontFamily.sans, maxWidth: '1600px', margin: '0 auto', background: tokens.colors.neutral[50], minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: tokens.spacing[8] }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: tokens.spacing[4], marginBottom: tokens.spacing[3] }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: tokens.typography.sizes['3xl'], fontWeight: tokens.typography.weights.bold, color: tokens.colors.semantic.text.primary, marginBottom: tokens.spacing[2], lineHeight: 1.2 }}>Team View</h1>
            <p style={{ fontSize: tokens.typography.sizes.base, color: tokens.colors.semantic.text.tertiary, lineHeight: 1.6 }}>View all team members and their assigned tickets in one place</p>
          </div>
        </div>

        {/* Summary Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: tokens.spacing[4], marginTop: tokens.spacing[6] }}>
          <StatCard icon={<Users size={24} color={tokens.colors.primary[600]} />} iconBg={tokens.colors.primary[100]} value={summary.total_members} label="Team Members" />
          <StatCard icon={<Ticket size={24} color={tokens.colors.success[600]} />} iconBg={tokens.colors.success[100]} value={summary.total_tickets} label="Active Tickets" />
          <StatCard icon={<Clock size={24} color={tokens.colors.warning[600]} />} iconBg={tokens.colors.warning[100]} value={avgTicketsPerMember} label="Avg Per Member" />
          <StatCard
            icon={<Clock size={24} color={summary.overdue_tickets > 0 ? tokens.colors.error[600] : tokens.colors.neutral[500]} />}
            iconBg={summary.overdue_tickets > 0 ? tokens.colors.error[100] : tokens.colors.neutral[100]}
            value={summary.overdue_tickets} label="Overdue Tickets"
            valueColor={summary.overdue_tickets > 0 ? tokens.colors.error[600] : undefined}
            borderColor={summary.overdue_tickets > 0 ? tokens.colors.error[200] : undefined}
          />
        </div>
      </div>

      {/* Search and Filters */}
      <div style={{ background: '#ffffff', borderRadius: tokens.borderRadius.xl, border: `1px solid ${tokens.colors.neutral[200]}`, boxShadow: tokens.shadows.sm, marginBottom: tokens.spacing[6] }}>
        <div style={{ padding: tokens.spacing[5] }}>
          <div style={{ position: 'relative' }}>
            <Search size={20} style={{ position: 'absolute', left: tokens.spacing[4], top: '50%', transform: 'translateY(-50%)', color: tokens.colors.semantic.text.tertiary, pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search by ticket key, title, or member name..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setOffset(0); }}
              style={{ width: '100%', padding: `${tokens.spacing[3]} ${tokens.spacing[4]} ${tokens.spacing[3]} ${tokens.spacing[12]}`, border: `2px solid ${tokens.colors.neutral[200]}`, borderRadius: tokens.borderRadius.lg, fontSize: tokens.typography.sizes.base, color: tokens.colors.semantic.text.primary, backgroundColor: '#ffffff', outline: 'none', transition: `border-color ${tokens.animation.duration.fast} ${tokens.animation.easing.easeOut}` }}
              onFocus={(e) => { e.currentTarget.style.borderColor = tokens.colors.primary[400]; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = tokens.colors.neutral[200]; }}
            />
          </div>
        </div>

        <div style={{ padding: `0 ${tokens.spacing[5]} ${tokens.spacing[3]}` }}>
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[2], padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`, backgroundColor: showFilters ? tokens.colors.primary[50] : 'transparent', color: showFilters ? tokens.colors.primary[700] : tokens.colors.semantic.text.secondary, border: `1px solid ${showFilters ? tokens.colors.primary[300] : tokens.colors.neutral[300]}`, borderRadius: tokens.borderRadius.md, fontSize: tokens.typography.sizes.sm, fontWeight: tokens.typography.weights.semibold, cursor: 'pointer', transition: `all ${tokens.animation.duration.fast} ${tokens.animation.easing.easeOut}` }}
          >
            <Filter size={16} />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
            {hasActiveFilters && <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: tokens.colors.primary[500] }} />}
          </button>
        </div>

        {showFilters && (
          <div style={{ padding: tokens.spacing[5], borderTop: `1px solid ${tokens.colors.neutral[200]}`, background: tokens.colors.neutral[50] }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: tokens.spacing[3] }}>
              <FilterDropdown value={selectedMember} options={memberOptions} onChange={setFilter(setSelectedMember)} />
              <FilterDropdown value={selectedProject} options={projectOptions} onChange={setFilter(setSelectedProject)} />
              <FilterDropdown value={selectedPriority} options={priorityOptions} onChange={setFilter(setSelectedPriority)} />
              <FilterDropdown value={selectedStatus} options={statusOptions} onChange={setFilter(setSelectedStatus)} />
              <FilterDropdown value={selectedDueDate} options={DUE_OPTIONS} onChange={setFilter(setSelectedDueDate)} />
            </div>

            {hasActiveFilters && (
              <div style={{ marginTop: tokens.spacing[4], display: 'flex', flexWrap: 'wrap', gap: tokens.spacing[2], alignItems: 'center' }}>
                <span style={{ fontSize: tokens.typography.sizes.xs, color: tokens.colors.semantic.text.tertiary, fontWeight: tokens.typography.weights.medium }}>Active Filters:</span>
                {selectedMember !== 'all' && <FilterChip label={`Member: ${labelFor(memberOptions, selectedMember)}`} onClear={() => setFilter(setSelectedMember)('all')} />}
                {selectedProject !== 'all' && <FilterChip label={`Project: ${labelFor(projectOptions, selectedProject)}`} onClear={() => setFilter(setSelectedProject)('all')} />}
                {selectedPriority !== 'all' && <FilterChip label={`Priority: ${labelFor(priorityOptions, selectedPriority)}`} onClear={() => setFilter(setSelectedPriority)('all')} />}
                {selectedStatus !== 'all' && <FilterChip label={`Status: ${labelFor(statusOptions, selectedStatus)}`} onClear={() => setFilter(setSelectedStatus)('all')} />}
                {selectedDueDate !== 'all' && <FilterChip label={`Due: ${labelFor(DUE_OPTIONS, selectedDueDate)}`} onClear={() => setFilter(setSelectedDueDate)('all')} />}
                <button onClick={clearAll} style={{ padding: `${tokens.spacing[1]} ${tokens.spacing[3]}`, fontSize: tokens.typography.sizes.xs, color: tokens.colors.primary[600], backgroundColor: 'transparent', border: 'none', cursor: 'pointer', fontWeight: tokens.typography.weights.semibold, textDecoration: 'underline' }}>Clear All</button>
              </div>
            )}
          </div>
        )}
      </div>

      {refreshing && (
        <div style={{ fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.tertiary, marginBottom: tokens.spacing[3] }}>Updating…</div>
      )}

      {/* Team Members */}
      {members.length === 0 ? (
        <div style={{ background: '#ffffff', borderRadius: tokens.borderRadius.xl, padding: tokens.spacing[12], textAlign: 'center', border: `1px solid ${tokens.colors.neutral[200]}`, boxShadow: tokens.shadows.sm }}>
          <Users size={48} color={tokens.colors.neutral[400]} style={{ marginBottom: tokens.spacing[4] }} />
          <p style={{ margin: 0, fontSize: tokens.typography.sizes.lg, color: tokens.colors.semantic.text.secondary, fontWeight: tokens.typography.weights.medium }}>No team members with assigned tickets found</p>
          <p style={{ margin: 0, marginTop: tokens.spacing[2], fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.tertiary }}>{hasActiveFilters ? 'Try adjusting your filters' : 'Team members with tickets will appear here'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing[5] }}>
          {members.map((member) => {
            const isOpen = expanded.has(member.user_id);
            const state = memberTickets[member.user_id];
            const loaded = state?.tickets ?? [];
            const ticketTotal = state?.total ?? member.ticket_count;
            const canLoadMore = loaded.length < ticketTotal;
            const loadingTickets = !!state?.loading;
            const showSkeleton = loadingTickets && loaded.length === 0;
            return (
              <div key={member.user_id} style={{ background: '#ffffff', borderRadius: tokens.borderRadius.xl, border: `1px solid ${tokens.colors.neutral[200]}`, boxShadow: tokens.shadows.sm, overflow: 'hidden' }}>
                {/* Member Header (click to expand/collapse) */}
                <div
                  onClick={() => toggleExpand(member.user_id)}
                  style={{ padding: tokens.spacing[5], borderBottom: isOpen ? `1px solid ${tokens.colors.neutral[200]}` : 'none', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[4] }}>
                    {isOpen ? <ChevronUp size={20} color={tokens.colors.semantic.text.tertiary} /> : <ChevronDown size={20} color={tokens.colors.semantic.text.tertiary} />}
                    <div style={{ width: '48px', height: '48px', borderRadius: tokens.borderRadius.full, background: tokens.colors.primary[500], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: tokens.typography.sizes.lg, fontWeight: tokens.typography.weights.bold, boxShadow: tokens.shadows.md }}>
                      {member.user_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <div style={{ fontSize: tokens.typography.sizes.lg, fontWeight: tokens.typography.weights.bold, color: tokens.colors.semantic.text.primary, marginBottom: tokens.spacing[1] }}>{member.user_name}</div>
                      <div style={{ fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.tertiary }}>{member.user_email}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[2], padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`, backgroundColor: tokens.colors.primary[100], color: tokens.colors.primary[700], borderRadius: tokens.borderRadius.full, fontSize: tokens.typography.sizes.sm, fontWeight: tokens.typography.weights.semibold }}>
                    <Ticket size={16} />
                    <span>{member.ticket_count} {member.ticket_count === 1 ? 'Ticket' : 'Tickets'}</span>
                  </div>
                </div>

                {/* Tickets (lazy-loaded on expand) */}
                {isOpen && (
                  <>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '720px' }}>
                        <colgroup>
                          {COLUMNS.map((c) => <col key={c.field} style={{ width: c.width }} />)}
                        </colgroup>
                        <thead>
                          <tr style={{ backgroundColor: tokens.colors.neutral[50] }}>
                            {COLUMNS.map((c) => (
                              <SortableHeader key={c.field} field={c.field} label={c.label} sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                            ))}
                          </tr>
                        </thead>
                        <tbody style={{ opacity: loadingTickets && loaded.length > 0 ? 0.5 : 1, transition: 'opacity 0.15s' }}>
                          {showSkeleton && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={`sk-${i}`} />)}
                          {loaded.map((ticket) => {
                            const priorityColor = getPriorityColor(ticket.priority);
                            const overdue = isOverdue(ticket.due_date);
                            return (
                              <tr
                                key={ticket.id}
                                onClick={() => handleTicketClick(ticket)}
                                style={{ cursor: 'pointer', borderBottom: `1px solid ${tokens.colors.neutral[100]}`, transition: `background-color ${tokens.animation.duration.fast} ${tokens.animation.easing.easeOut}` }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = tokens.colors.primary[50]; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                              >
                                <td style={{ padding: tokens.spacing[3], fontSize: tokens.typography.sizes.sm, fontWeight: tokens.typography.weights.semibold, color: tokens.colors.primary[600], ...cellTruncate }}>{ticket.key}</td>
                                <td style={{ padding: tokens.spacing[3], fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.primary, ...cellTruncate }}>{ticket.title}</td>
                                <td style={{ padding: tokens.spacing[3], fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.secondary, ...cellTruncate }}>{ticket.project_name}</td>
                                <td style={{ padding: tokens.spacing[3], ...cellTruncate }}>
                                  {ticket.priority ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: `${tokens.spacing[1]} ${tokens.spacing[2]}`, borderRadius: tokens.borderRadius.sm, backgroundColor: priorityColor.bg, color: priorityColor.text, border: `1px solid ${priorityColor.border}`, fontSize: tokens.typography.sizes.xs, fontWeight: tokens.typography.weights.semibold, textTransform: 'uppercase' }}>{ticket.priority}</span>
                                  ) : (
                                    <span style={{ color: tokens.colors.semantic.text.tertiary, fontSize: tokens.typography.sizes.sm }}>-</span>
                                  )}
                                </td>
                                <td style={{ padding: tokens.spacing[3], fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.primary, ...cellTruncate }}>{ticket.status || '-'}</td>
                                <td style={{ padding: tokens.spacing[3], fontSize: tokens.typography.sizes.sm, color: overdue ? tokens.colors.error[600] : tokens.colors.semantic.text.secondary, fontWeight: overdue ? tokens.typography.weights.semibold : tokens.typography.weights.regular, ...cellTruncate }}>
                                  {formatDate(ticket.due_date)}
                                  {overdue && <span style={{ marginLeft: tokens.spacing[2], fontSize: tokens.typography.sizes.xs, color: tokens.colors.error[600] }}>(Overdue)</span>}
                                </td>
                              </tr>
                            );
                          })}
                          {!showSkeleton && loaded.length === 0 && !loadingTickets && (
                            <tr><td colSpan={6} style={{ padding: tokens.spacing[5], textAlign: 'center', fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.tertiary }}>No tickets match the current filters.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {!showSkeleton && (loadingTickets ? (
                      <div style={{ padding: tokens.spacing[3], textAlign: 'center', borderTop: `1px solid ${tokens.colors.neutral[100]}` }}>
                        <span style={{ fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.tertiary }}>Updating…</span>
                      </div>
                    ) : canLoadMore ? (
                      <div style={{ padding: tokens.spacing[3], textAlign: 'center', borderTop: `1px solid ${tokens.colors.neutral[100]}` }}>
                        <button
                          onClick={() => loadMember(member.user_id, 'more')}
                          style={{ padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`, fontSize: tokens.typography.sizes.sm, fontWeight: tokens.typography.weights.semibold, color: tokens.colors.primary[600], background: tokens.colors.primary[50], border: 'none', borderRadius: tokens.borderRadius.md, cursor: 'pointer' }}
                        >
                          Load more ({loaded.length} of {ticketTotal})
                        </button>
                      </div>
                    ) : null)}
                  </>
                )}
              </div>
            );
          })}

          {total > MEMBER_PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${tokens.spacing[2]} ${tokens.spacing[1]}` }}>
              <span style={{ fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.tertiary }}>Showing {pageStart}–{pageEnd} of {total} members</span>
              <div style={{ display: 'flex', gap: tokens.spacing[2] }}>
                <PageButton disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - MEMBER_PAGE_SIZE))}><ChevronLeft size={16} /> Prev</PageButton>
                <PageButton disabled={!hasMore} onClick={() => setOffset(offset + MEMBER_PAGE_SIZE)}>Next <ChevronRight size={16} /></PageButton>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedTicketId && selectedProjectId && (
        <TicketDetailModal
          isOpen={!!selectedTicketId}
          onClose={() => { setSelectedTicketId(null); setSelectedProjectId(null); }}
          projectId={selectedProjectId}
          ticketId={selectedTicketId}
          onTicketUpdated={() => { fetchTeamView(); }}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}

function SkeletonRow() {
  const widths = ['60%', '80%', '50%', '40%', '55%', '45%'];
  return (
    <tr style={{ borderBottom: `1px solid ${tokens.colors.neutral[100]}` }}>
      {widths.map((w, i) => (
        <td key={i} style={{ padding: tokens.spacing[3] }}>
          <div style={{ height: 12, width: w, borderRadius: 4, background: tokens.colors.neutral[200], animation: 'pulse 1.2s ease-in-out infinite' }} />
        </td>
      ))}
    </tr>
  );
}

function StatCard({ icon, iconBg, value, label, valueColor, borderColor }: { icon: React.ReactNode; iconBg: string; value: React.ReactNode; label: string; valueColor?: string; borderColor?: string }) {
  return (
    <div style={{ padding: tokens.spacing[5], background: '#ffffff', borderRadius: tokens.borderRadius.xl, border: `1px solid ${borderColor ?? tokens.colors.neutral[200]}`, boxShadow: tokens.shadows.sm }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[3] }}>
        <div style={{ width: '48px', height: '48px', borderRadius: tokens.borderRadius.lg, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
        <div>
          <div style={{ fontSize: tokens.typography.sizes['2xl'], fontWeight: tokens.typography.weights.bold, color: valueColor ?? tokens.colors.semantic.text.primary }}>{value}</div>
          <div style={{ fontSize: tokens.typography.sizes.xs, color: tokens.colors.semantic.text.tertiary, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: tokens.typography.weights.medium, marginTop: tokens.spacing[1] }}>{label}</div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: tokens.spacing[2], padding: `${tokens.spacing[1]} ${tokens.spacing[3]}`, backgroundColor: tokens.colors.primary[100], color: tokens.colors.primary[700], borderRadius: tokens.borderRadius.full, fontSize: tokens.typography.sizes.xs, fontWeight: tokens.typography.weights.medium }}>
      <span>{label}</span>
      <X size={14} style={{ cursor: 'pointer' }} onClick={onClear} />
    </div>
  );
}

function PageButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[1], padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`, fontSize: tokens.typography.sizes.sm, fontWeight: tokens.typography.weights.semibold, color: disabled ? tokens.colors.neutral[400] : tokens.colors.semantic.text.primary, background: '#ffffff', border: `1px solid ${tokens.colors.neutral[300]}`, borderRadius: tokens.borderRadius.md, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {children}
    </button>
  );
}
