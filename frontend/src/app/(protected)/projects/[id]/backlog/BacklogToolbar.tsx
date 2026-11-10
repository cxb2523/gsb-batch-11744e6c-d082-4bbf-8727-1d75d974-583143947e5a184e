import React from 'react';
import { Plus, Search, ChevronDown } from 'lucide-react';
import { PRIORITY_OPTIONS } from '@/lib/priority';
import { ProjectMember, WorkflowStatus } from '../../../../../lib/api/settings';
import { EpicListItem } from '../../../../../lib/api/epics';
import { COLORS } from './constants';

interface BacklogToolbarProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onCreateIssue: () => void;
  members: ProjectMember[];
  statuses: WorkflowStatus[];
  epicsList: EpicListItem[];
  openDropdown: string | null;
  setOpenDropdown: (value: string | null) => void;
  assigneeFilter: number | 'all';
  setAssigneeFilter: (value: number | 'all') => void;
  typeFilter: string | 'all';
  setTypeFilter: (value: string | 'all') => void;
  priorityFilter: string | 'all';
  setPriorityFilter: (value: string | 'all') => void;
  statusFilter: number | 'all';
  setStatusFilter: (value: number | 'all') => void;
  epicFilter: number | 'all';
  setEpicFilter: (value: number | 'all') => void;
}

function renderBacklogDropdown(opts: {
  id: string;
  label: string;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  options: { id: number | string; name: string }[];
  value: number | string;
  onChange: (v: number | string) => void;
}) {
  return (
    <div key={opts.id} style={{ position: 'relative' }} data-backlog-dropdown>
      <button
        onClick={opts.onToggle}
        style={{
          height: 32,
          padding: '0 10px',
          border: `1px solid ${opts.isActive ? COLORS.primary : COLORS.border}`,
          borderRadius: 3,
          background: opts.isActive ? COLORS.activeBg : COLORS.cardBg,
          color: opts.isActive ? COLORS.primary : COLORS.textSecondary,
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          maxWidth: 200,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opts.label}</span>
        <ChevronDown size={14} />
      </button>
      {opts.isOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, minWidth: 200, maxHeight: 300,
          overflowY: 'auto', background: COLORS.cardBg, border: `1px solid ${COLORS.border}`,
          borderRadius: 3, boxShadow: '0 4px 8px rgba(0,0,0,0.12)', zIndex: 1000, padding: '4px 0',
        }}>
          {opts.options.map(option => (
            <div
              key={String(option.id)}
              onClick={() => opts.onChange(option.id)}
              style={{
                padding: '6px 12px', fontSize: 13, cursor: 'pointer',
                background: opts.value === option.id ? COLORS.activeBg : 'transparent',
                color: opts.value === option.id ? COLORS.primary : COLORS.textPrimary,
                fontWeight: opts.value === option.id ? 600 : 400,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
              onMouseEnter={(e) => { if (opts.value !== option.id) e.currentTarget.style.background = COLORS.hoverBg; }}
              onMouseLeave={(e) => { if (opts.value !== option.id) e.currentTarget.style.background = 'transparent'; }}
              title={option.name}
            >
              {option.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BacklogToolbar({
  searchQuery,
  setSearchQuery,
  onCreateIssue,
  members,
  statuses,
  epicsList,
  openDropdown,
  setOpenDropdown,
  assigneeFilter,
  setAssigneeFilter,
  typeFilter,
  setTypeFilter,
  priorityFilter,
  setPriorityFilter,
  statusFilter,
  setStatusFilter,
  epicFilter,
  setEpicFilter,
}: BacklogToolbarProps) {
  return (
    <div style={{ flexShrink: 0, padding: '16px 24px', background: COLORS.cardBg, borderBottom: `2px solid ${COLORS.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, color: COLORS.textPrimary }}>Backlog</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 14, color: COLORS.textSecondary }}>
            Plan your sprints by dragging issues from backlog
          </p>
        </div>
        <button
          onClick={onCreateIssue}
          style={{
            background: COLORS.primary,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 3,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            transition: 'background 150ms',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#0747A6'}
          onMouseLeave={(e) => e.currentTarget.style.background = COLORS.primary}
        >
          <Plus size={16} />
          Create Issue
        </button>
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative', maxWidth: 400 }}>
        <Search size={16} style={{ position: 'absolute', left: 8, top: 8, color: COLORS.textTertiary }} />
        <input
          type="text"
          placeholder="Search issues..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 12px 6px 32px',
            border: `2px solid ${COLORS.border}`,
            borderRadius: 3,
            fontSize: 14,
            color: COLORS.textPrimary,
            outline: 'none',
            transition: 'border-color 150ms',
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = COLORS.primary}
          onBlur={(e) => e.currentTarget.style.borderColor = COLORS.border}
        />
      </div>

      {/* Filter & Sort Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {renderBacklogDropdown({
          id: 'assignee',
          label: assigneeFilter === 'all' ? 'All assignees' : (members.find(m => m.user_id === assigneeFilter)?.name || 'Assignee'),
          isActive: assigneeFilter !== 'all',
          isOpen: openDropdown === 'assignee',
          onToggle: () => setOpenDropdown(openDropdown === 'assignee' ? null : 'assignee'),
          options: [
            { id: 'all', name: 'All assignees' },
            ...members.map(m => ({ id: m.user_id, name: m.name || m.email })),
          ],
          value: assigneeFilter,
          onChange: (v) => { setAssigneeFilter(v as number | 'all'); setOpenDropdown(null); },
        })}
        {renderBacklogDropdown({
          id: 'type',
          label: typeFilter === 'all' ? 'All types' : typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1),
          isActive: typeFilter !== 'all',
          isOpen: openDropdown === 'type',
          onToggle: () => setOpenDropdown(openDropdown === 'type' ? null : 'type'),
          options: [
            { id: 'all', name: 'All types' },
            { id: 'task', name: 'Task' },
            { id: 'bug', name: 'Bug' },
            { id: 'story', name: 'Story' },
            { id: 'epic', name: 'Epic' },
            { id: 'subtask', name: 'Subtask' },
          ],
          value: typeFilter,
          onChange: (v) => { setTypeFilter(v as string); setOpenDropdown(null); },
        })}
        {renderBacklogDropdown({
          id: 'priority',
          label: priorityFilter === 'all' ? 'All priorities' : priorityFilter.charAt(0).toUpperCase() + priorityFilter.slice(1),
          isActive: priorityFilter !== 'all',
          isOpen: openDropdown === 'priority',
          onToggle: () => setOpenDropdown(openDropdown === 'priority' ? null : 'priority'),
          options: [
            { id: 'all', name: 'All priorities' },
            ...PRIORITY_OPTIONS.map((o) => ({ id: o.value, name: o.label })),
          ],
          value: priorityFilter,
          onChange: (v) => { setPriorityFilter(v as string); setOpenDropdown(null); },
        })}
        {renderBacklogDropdown({
          id: 'status',
          label: statusFilter === 'all' ? 'All statuses' : (statuses.find(s => s.id === statusFilter)?.name || 'Status'),
          isActive: statusFilter !== 'all',
          isOpen: openDropdown === 'status',
          onToggle: () => setOpenDropdown(openDropdown === 'status' ? null : 'status'),
          options: [
            { id: 'all', name: 'All statuses' },
            ...statuses.map(s => ({ id: s.id, name: s.name })),
          ],
          value: statusFilter,
          onChange: (v) => { setStatusFilter(v as number | 'all'); setOpenDropdown(null); },
        })}
        {renderBacklogDropdown({
          id: 'epic',
          label: epicFilter === 'all' ? 'All epics' : (epicsList.find(e => e.id === epicFilter)?.title || `Epic #${epicFilter}`),
          isActive: epicFilter !== 'all',
          isOpen: openDropdown === 'epic',
          onToggle: () => setOpenDropdown(openDropdown === 'epic' ? null : 'epic'),
          options: [
            { id: 'all', name: 'All epics' },
            ...epicsList.map(e => ({ id: e.id, name: e.title })),
          ],
          value: epicFilter,
          onChange: (v) => { setEpicFilter(v as number | 'all'); setOpenDropdown(null); },
        })}
      </div>
    </div>
  );
}
