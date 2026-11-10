'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, CornerDownRight, NotebookPen, PencilLine, Trash2 } from 'lucide-react';
import { Select, SelectOption, ButtonCore } from '@/components/ui';
import { TASK_TEXT_MAX, type StandupTask, type TaskStatus } from '@/lib/api/standup';
import { isPending } from './BlockerNotes';
import { RowActionMenu, type RowMenuItem } from './RowActionMenu';
import { type DragHandlers, LinkMarker, type LinkState } from './StandupTicketRow';
import { C, CATEGORY_STYLE, RADIUS } from './tokens';

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };

const STATUS_OPTIONS: SelectOption<TaskStatus>[] = (Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((value) => ({
  value,
  label: TASK_STATUS_LABEL[value],
  color: CATEGORY_STYLE[value].dot,
}));

const META_TEXT: React.CSSProperties = { fontSize: 12, lineHeight: '16px', whiteSpace: 'nowrap' };

function StatusChip({ status, interactive }: { status: TaskStatus; interactive: boolean }) {
  const style = CATEGORY_STYLE[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 20,
        padding: interactive ? '0 4px 0 8px' : '0 8px',
        borderRadius: RADIUS.sm,
        background: style.bg,
        color: style.fg,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: style.dot }} />
      {TASK_STATUS_LABEL[status]}
      {interactive && <ChevronDown size={12} aria-hidden />}
    </span>
  );
}

interface Props {
  task: StandupTask;
  /** Set when the same adhoc task is in both Yesterday and Today. */
  link?: LinkState;
  /** Present when the card can be dragged to the other column. */
  drag?: DragHandlers;
  readOnly: boolean;
  /** Where carry forward lands, e.g. "today" or "Mon". */
  carryLabel: string;
  onStatusChange: (task: StandupTask, status: TaskStatus) => void;
  onCarryForward: (task: StandupTask) => void;
  onEdit: (task: StandupTask, text: string) => void;
  onRemove: (task: StandupTask) => void;
}

/** A plain-text task: same rhythm as a ticket row, with its status editable in place. */
export function StandupTaskRow({ task, readOnly, carryLabel, link, drag, onStatusChange, onCarryForward, onEdit, onRemove }: Props) {
  const pending = isPending(task);
  const editable = !readOnly && !pending;
  const canCarry = editable && task.status !== 'done' && !task.carried_forward;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus on entering edit mode and drop the caret at the end, ready to append.
  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [editing]);

  const startEdit = () => {
    setDraft(task.text);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft(task.text);
  };
  const saveEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.text) onEdit(task, trimmed);
    setEditing(false);
  };

  const menuItems: RowMenuItem[] = [
    { key: 'edit', label: 'Edit text', icon: <PencilLine size={16} />, onSelect: startEdit },
  ];
  if (canCarry) {
    menuItems.push({ key: 'carry', label: `Carry to ${carryLabel}`, icon: <ArrowRight size={16} />, onSelect: () => onCarryForward(task) });
  }
  menuItems.push({ key: 'delete', label: 'Delete task', icon: <Trash2 size={16} />, onSelect: () => onRemove(task), danger: true });

  return (
    <div
      className={`su-row su-row--static${editable ? ' su-row--actions' : ''}${link ? ' su-row--linked' : ''}${drag?.active ? ' su-row--dragging' : ''}`}
      style={
        {
          opacity: pending ? 0.7 : 1,
          ...(link && {
            background: link.color.bg,
            '--su-row-bg': link.color.bg,
            boxShadow: link.highlighted ? `0 0 0 2px ${link.color.ring}` : undefined,
          }),
        } as React.CSSProperties
      }
      draggable={Boolean(drag) && !editing}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', task.text);
        drag?.onStart();
      }}
      onDragEnd={() => drag?.onEnd()}
      onMouseEnter={() => link?.onHover(true)}
      onMouseLeave={() => link?.onHover(false)}
      onFocus={() => link?.onHover(true)}
      onBlur={() => link?.onHover(false)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
        <span style={{ display: 'inline-flex', marginTop: 2, flexShrink: 0, color: C.textMuted }} title="Adhoc task">
          <NotebookPen size={16} aria-hidden />
        </span>
        {editing ? (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <textarea
              ref={textareaRef}
              value={draft}
              maxLength={TASK_TEXT_MAX}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  saveEdit();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelEdit();
                }
              }}
              aria-label="Edit task text"
              className="su-input"
              style={{ height: 'auto', minHeight: 56, padding: 8, lineHeight: '20px', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <ButtonCore variant="primary" size="md" onClick={saveEdit} disabled={!draft.trim()}>
                Save
              </ButtonCore>
              <ButtonCore variant="ghost" size="md" onClick={cancelEdit}>
                Cancel
              </ButtonCore>
            </div>
          </div>
        ) : (
          <span
            className="su-row-title"
            title={task.text}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 14,
              lineHeight: '20px',
              color: C.text,
              fontWeight: 500,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflowWrap: 'anywhere',
            }}
          >
            {task.text}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, marginTop: 4, paddingLeft: 24 }}>
        {editable ? (
          <Select<TaskStatus>
            value={task.status}
            onChange={(value) => value && value !== task.status && onStatusChange(task, value)}
            options={STATUS_OPTIONS}
            ariaLabel={`Status of task: ${task.text.slice(0, 60)}`}
            variant="ghost"
            size="sm"
            searchable={false}
            minMenuWidth={160}
            // The chip draws its own caret, so suppress the Select's built-in one.
            hideChevron
            // The chip is the whole control: no ghost padding or stretching around it.
            style={{ flex: '0 0 auto', width: 'fit-content', height: 24, padding: 0, border: 'none', background: 'transparent' }}
            renderTrigger={() => <StatusChip status={task.status} interactive />}
          />
        ) : (
          <StatusChip status={task.status} interactive={false} />
        )}
        {link && <LinkMarker side={link.side} />}
        {pending && <span style={{ ...META_TEXT, color: C.textMuted }}>Saving…</span>}
        {/* The link marker already says where it came from or went, so don't repeat it. */}
        {task.carried_from && !link && (
          <span style={{ ...META_TEXT, color: C.textMuted, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CornerDownRight size={11} aria-hidden /> Carried over
          </span>
        )}
        {task.carried_forward && !(link && link.side === 'yesterday') && (
          <span style={{ ...META_TEXT, color: C.accent, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowRight size={11} aria-hidden /> Carried to {carryLabel}
          </span>
        )}
      </div>

      {editable && !editing && <RowActionMenu items={menuItems} label={`Actions for task: ${task.text.slice(0, 60)}`} />}
    </div>
  );
}
