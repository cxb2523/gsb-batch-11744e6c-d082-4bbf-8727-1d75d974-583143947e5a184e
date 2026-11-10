'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronDown, Users, CheckSquare, Flag, Tag, MinusCircle, Layers, Target, Archive, Trash2 } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { PRIORITY_OPTIONS as PRIORITY_LEVELS } from '../../lib/priority';
import type { ProjectMember, WorkflowStatus, Label } from '../../lib/api/settings';
import type { Sprint } from '../../lib/api/sprints';
import type { EpicListItem } from '../../lib/api/epics';
import type { TicketBulkUpdateFields } from '../../lib/api/tickets';
import { canMoveTo } from '../../lib/statusFlow';

type ActionKind = 'assign' | 'status' | 'priority' | 'labels_add' | 'labels_remove' | 'sprint' | 'epic';

/** The transition-relevant fields of a selected ticket, for the status cap. */
export interface BulkSelectionEntry {
  statusId?: number | null;
  preBlockStatusId?: number | null;
}

export interface BulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  onApply: (updates: TicketBulkUpdateFields) => Promise<void> | void;
  members: ProjectMember[];
  statuses: WorkflowStatus[];
  /**
   * The selected tickets' current status + pre-block status, so the Status menu can
   * grey out any target that would be an illegal forward jump for one of them.
   * Omit to leave every status enabled (backend still enforces the cap).
   */
  selectedTickets?: BulkSelectionEntry[];
  labels: Label[];
  sprints: Sprint[];
  epics: EpicListItem[];
  /** When true, the Sprint action appears first and is highlighted (Backlog use). */
  emphasizeSprint?: boolean;
  /** Archive the selected issues. Omit to hide the action. */
  onArchive?: () => Promise<void> | void;
  /** Delete the selected issues. The caller owns the confirmation. */
  onDelete?: () => void;
}

const PRIORITY_OPTIONS: { id: NonNullable<TicketBulkUpdateFields['priority']>; name: string }[] =
  PRIORITY_LEVELS.map((o) => ({ id: o.value, name: o.label }));

const COLORS = {
  primary: '#0052CC',
  border: '#DFE1E6',
  textPrimary: '#172B4D',
  textSecondary: '#5E6C84',
  bg: '#FFFFFF',
  hover: '#F4F5F7',
  emphasis: '#0747A6',
};

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  onClear,
  onApply,
  members,
  statuses,
  selectedTickets,
  labels,
  sprints,
  epics,
  emphasizeSprint = false,
  onArchive,
  onDelete,
}) => {
  const [open, setOpen] = useState<ActionKind | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [applying, setApplying] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Close popovers on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-bulk-action]')) {
        setOpen(null);
        setLabelInput('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const apply = async (updates: TicketBulkUpdateFields) => {
    if (applying) return;
    setApplying(true);
    try {
      await onApply(updates);
      setOpen(null);
      setLabelInput('');
    } finally {
      setApplying(false);
    }
  };

  const buttonBase: React.CSSProperties = {
    height: 32,
    padding: '0 10px',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 3,
    background: COLORS.bg,
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: tokens.fontFamily.sans,
    whiteSpace: 'nowrap',
  };

  const popoverBase: React.CSSProperties = {
    position: 'absolute',
    bottom: 'calc(100% + 6px)',
    left: 0,
    minWidth: 220,
    maxHeight: 320,
    overflowY: 'auto',
    background: COLORS.bg,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 4,
    boxShadow: '0 8px 24px rgba(9,30,66,0.18)',
    zIndex: 1100,
    padding: '4px 0',
  };

  const itemBase: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: 13,
    cursor: 'pointer',
    color: COLORS.textPrimary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  // ---- Button + popover renderers ----
  const SprintButton = (
    <div style={{ position: 'relative' }} data-bulk-action key="sprint">
      <button
        onClick={() => setOpen(open === 'sprint' ? null : 'sprint')}
        style={{
          ...buttonBase,
          ...(emphasizeSprint
            ? { background: COLORS.primary, color: '#fff', border: `1px solid ${COLORS.primary}` }
            : {}),
        }}
        title="Move to sprint"
      >
        <Target size={14} />
        Move to sprint
        <ChevronDown size={12} />
      </button>
      {open === 'sprint' && (
        <div style={popoverBase}>
          <div
            style={{ ...itemBase, color: COLORS.textSecondary }}
            onClick={() => apply({ sprint_id: null as unknown as number })}
            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Remove from sprint
          </div>
          {sprints.length === 0 ? (
            <div style={{ ...itemBase, color: COLORS.textSecondary, cursor: 'default' }}>No sprints</div>
          ) : (
            sprints.map((s) => (
              <div
                key={s.id}
                style={itemBase}
                onClick={() => apply({ sprint_id: s.id })}
                onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                title={s.name}
              >
                {s.name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  const AssignButton = (
    <div style={{ position: 'relative' }} data-bulk-action key="assign">
      <button onClick={() => setOpen(open === 'assign' ? null : 'assign')} style={buttonBase}>
        <Users size={14} />
        Assign
        <ChevronDown size={12} />
      </button>
      {open === 'assign' && (
        <div style={popoverBase}>
          <div
            style={{ ...itemBase, color: COLORS.textSecondary }}
            onClick={() => apply({ assignee_email: '' })}
            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Unassign
          </div>
          {members.map((m) => (
            <div
              key={m.user_id}
              style={itemBase}
              onClick={() => apply({ assignee_email: m.email })}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              title={`${m.name} <${m.email}>`}
            >
              {m.name || m.email}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const StatusButton = (
    <div style={{ position: 'relative' }} data-bulk-action key="status">
      <button onClick={() => setOpen(open === 'status' ? null : 'status')} style={buttonBase}>
        <CheckSquare size={14} />
        Status
        <ChevronDown size={12} />
      </button>
      {open === 'status' && (
        <div style={popoverBase}>
          {statuses.length === 0 ? (
            <div style={{ ...itemBase, color: COLORS.textSecondary, cursor: 'default' }}>No statuses</div>
          ) : (
            statuses.map((s) => {
              // A single target applies to the whole selection, so it's only offered when
              // it's a legal move for every selected ticket. Count the ones it would break.
              const blockedFor = (selectedTickets || []).filter(
                (t) => !canMoveTo(statuses, t.statusId, s.id, t.preBlockStatusId),
              ).length;
              const total = selectedTickets?.length ?? 0;
              const disabled = blockedFor > 0;
              return (
                <div
                  key={s.id}
                  style={{
                    ...itemBase,
                    ...(disabled
                      ? { color: COLORS.textSecondary, opacity: 0.5, cursor: 'not-allowed' }
                      : {}),
                  }}
                  onClick={disabled ? undefined : () => apply({ status_id: s.id })}
                  onMouseEnter={(e) => {
                    if (!disabled) e.currentTarget.style.background = COLORS.hover;
                  }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  title={
                    disabled
                      ? `Not a valid next step for ${blockedFor} of ${total} selected`
                      : undefined
                  }
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: s.color || '#42526E',
                      marginRight: 6,
                      verticalAlign: 'middle',
                    }}
                  />
                  {s.name}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );

  const PriorityButton = (
    <div style={{ position: 'relative' }} data-bulk-action key="priority">
      <button onClick={() => setOpen(open === 'priority' ? null : 'priority')} style={buttonBase}>
        <Flag size={14} />
        Priority
        <ChevronDown size={12} />
      </button>
      {open === 'priority' && (
        <div style={popoverBase}>
          {PRIORITY_OPTIONS.map((p) => (
            <div
              key={p.id}
              style={itemBase}
              onClick={() => apply({ priority: p.id })}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {p.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const LabelPopover = (kind: 'labels_add' | 'labels_remove') => {
    const onSubmit = (name: string) => {
      const v = name.trim();
      if (!v) return;
      if (kind === 'labels_add') {
        apply({ labels_add: [v] });
      } else {
        apply({ labels_remove: [v] });
      }
    };
    return (
      <div style={popoverBase}>
        <div style={{ padding: '6px 10px', borderBottom: `1px solid ${COLORS.border}` }}>
          <input
            autoFocus
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSubmit(labelInput);
              } else if (e.key === 'Escape') {
                setOpen(null);
                setLabelInput('');
              }
            }}
            placeholder={kind === 'labels_add' ? 'Add label…' : 'Remove label…'}
            style={{
              width: '100%',
              padding: '6px 8px',
              border: `1px solid ${COLORS.border}`,
              borderRadius: 3,
              fontSize: 13,
              outline: 'none',
              fontFamily: tokens.fontFamily.sans,
            }}
          />
        </div>
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {labels
            .filter((l) => l.name.toLowerCase().includes(labelInput.toLowerCase()))
            .map((l) => (
              <div
                key={l.id}
                style={itemBase}
                onClick={() => onSubmit(l.name)}
                onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: l.color || '#DFE1E6',
                    marginRight: 6,
                    verticalAlign: 'middle',
                  }}
                />
                {l.name}
              </div>
            ))}
          {labelInput.trim() && !labels.some((l) => l.name.toLowerCase() === labelInput.trim().toLowerCase()) && (
            <div
              style={{ ...itemBase, color: COLORS.primary }}
              onClick={() => onSubmit(labelInput)}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {kind === 'labels_add' ? `Add "${labelInput.trim()}"` : `Remove "${labelInput.trim()}"`}
            </div>
          )}
        </div>
      </div>
    );
  };

  const AddLabelButton = (
    <div style={{ position: 'relative' }} data-bulk-action key="labels_add">
      <button onClick={() => setOpen(open === 'labels_add' ? null : 'labels_add')} style={buttonBase}>
        <Tag size={14} />
        Add label
        <ChevronDown size={12} />
      </button>
      {open === 'labels_add' && LabelPopover('labels_add')}
    </div>
  );

  const RemoveLabelButton = (
    <div style={{ position: 'relative' }} data-bulk-action key="labels_remove">
      <button onClick={() => setOpen(open === 'labels_remove' ? null : 'labels_remove')} style={buttonBase}>
        <MinusCircle size={14} />
        Remove label
        <ChevronDown size={12} />
      </button>
      {open === 'labels_remove' && LabelPopover('labels_remove')}
    </div>
  );

  const EpicButton = (
    <div style={{ position: 'relative' }} data-bulk-action key="epic">
      <button onClick={() => setOpen(open === 'epic' ? null : 'epic')} style={buttonBase}>
        <Layers size={14} />
        Epic
        <ChevronDown size={12} />
      </button>
      {open === 'epic' && (
        <div style={popoverBase}>
          <div
            style={{ ...itemBase, color: COLORS.textSecondary }}
            onClick={() => apply({ epic_id: null as unknown as number })}
            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Remove from epic
          </div>
          {epics.length === 0 ? (
            <div style={{ ...itemBase, color: COLORS.textSecondary, cursor: 'default' }}>No epics</div>
          ) : (
            epics.map((e) => (
              <div
                key={e.id}
                style={itemBase}
                onClick={() => apply({ epic_id: e.id })}
                onMouseEnter={(ev) => (ev.currentTarget.style.background = COLORS.hover)}
                onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                title={e.title}
              >
                {e.title}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  // Order with sprint emphasis on backlog
  const actionButtons = emphasizeSprint
    ? [SprintButton, AssignButton, StatusButton, PriorityButton, AddLabelButton, RemoveLabelButton, EpicButton]
    : [AssignButton, StatusButton, PriorityButton, AddLabelButton, RemoveLabelButton, SprintButton, EpicButton];

  return (
    <div
      ref={barRef}
      style={{
        position: 'sticky',
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        background: '#FFFFFF',
        borderTop: `1px solid ${COLORS.border}`,
        boxShadow: '0 -4px 12px rgba(9,30,66,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 24px',
        zIndex: 50,
        fontFamily: tokens.fontFamily.sans,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: COLORS.textPrimary,
          paddingRight: 12,
          borderRight: `1px solid ${COLORS.border}`,
        }}
      >
        {selectedCount} selected
      </div>
      <button
        onClick={onClear}
        style={{
          ...buttonBase,
          border: 'none',
          background: 'transparent',
          color: COLORS.textSecondary,
          padding: '0 8px',
        }}
        title="Clear selection"
      >
        <X size={14} />
        Clear
      </button>
      <div style={{ width: 1, height: 24, background: COLORS.border }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {actionButtons}

        {(onArchive || onDelete) && <div style={{ width: 1, height: 24, background: COLORS.border }} />}

        {onArchive && (
          <button
            onClick={async () => {
              setApplying(true);
              try {
                await onArchive();
              } finally {
                setApplying(false);
              }
            }}
            disabled={applying}
            style={buttonBase}
            title="Hide these issues from the board. Reversible."
          >
            <Archive size={14} />
            Archive
          </button>
        )}

        {onDelete && (
          <button
            onClick={onDelete}
            disabled={applying}
            style={{
              ...buttonBase,
              color: tokens.colors.error[600],
              border: `1px solid ${tokens.colors.error[200]}`,
            }}
            title="Permanently delete these issues"
          >
            <Trash2 size={14} />
            Delete
          </button>
        )}
      </div>
      {applying && (
        <div style={{ marginLeft: 'auto', fontSize: 12, color: COLORS.textSecondary }}>Applying…</div>
      )}
    </div>
  );
};

export default BulkActionBar;
