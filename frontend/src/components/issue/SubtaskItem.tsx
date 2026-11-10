'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Check, ChevronRight, Trash2, ChevronDown, ArchiveRestore } from 'lucide-react';
import { Subtask, SubtaskPriority } from '../../lib/api/subtasks';
import { PRIORITIES as PRIORITY_ORDER, PRIORITY_COLOR as PRIORITY_COLORS, PRIORITY_LABELS } from '../../lib/priority';
import { tokens } from '../../design-system/tokens';

interface SubtaskItemProps {
  subtask: Subtask;
  onToggleComplete: (subtaskId: number, completed: boolean) => Promise<void>;
  onDelete: (subtaskId: number) => Promise<void>;
  /** Detach this subtask and make it a standalone issue. */
  onPromote?: (subtaskId: number) => Promise<void>;
  /** Restore an archived subtask. Shown only for archived rows. */
  onUnarchive?: (subtaskId: number) => Promise<void>;
  onOpenDetail: (subtaskId: number) => void;
  onChangePriority?: (subtaskId: number, priority: SubtaskPriority) => void;
  canEdit: boolean;
}

export default function SubtaskItem({
  subtask,
  onToggleComplete,
  onDelete,
  onPromote,
  onUnarchive,
  onOpenDetail,
  onChangePriority,
  canEdit,
}: SubtaskItemProps) {
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  const [isUnarchiving, setIsUnarchiving] = useState(false);
  const isArchived = !!subtask.archived;
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  // Menu is rendered in a portal with fixed positioning so it can't be clipped
  // or covered by the modal's scroll container / sibling rows.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const openPriorityMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setShowPriorityMenu(true);
  };

  useEffect(() => {
    if (!showPriorityMenu) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setShowPriorityMenu(false);
      }
    };
    const onReposition = () => setShowPriorityMenu(false);
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [showPriorityMenu]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit || isToggling) return;

    try {
      setIsToggling(true);
      await onToggleComplete(subtask.id, !subtask.completed);
    } catch (error) {
      console.error('Failed to toggle subtask:', error);
    } finally {
      setIsToggling(false);
    }
  };

  const handleUnarchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit || !onUnarchive || isUnarchiving) return;
    try {
      setIsUnarchiving(true);
      await onUnarchive(subtask.id);
    } catch (error) {
      console.error('Failed to unarchive subtask:', error);
    } finally {
      setIsUnarchiving(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit || isDeleting) return;

    if (confirm('Are you sure you want to delete this subtask?')) {
      try {
        setIsDeleting(true);
        await onDelete(subtask.id);
      } catch (error) {
        console.error('Failed to delete subtask:', error);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        backgroundColor: isArchived ? tokens.colors.neutral[50] : tokens.colors.semantic.background.default,
        border: `1px solid ${tokens.colors.neutral[200]}`,
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        opacity: isArchived ? 0.72 : 1,
      }}
      onClick={() => onOpenDetail(subtask.id)}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = isArchived ? tokens.colors.neutral[100] : tokens.colors.neutral[50];
        e.currentTarget.style.borderColor = tokens.colors.neutral[300];
        e.currentTarget.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isArchived ? tokens.colors.neutral[50] : tokens.colors.semantic.background.default;
        e.currentTarget.style.borderColor = tokens.colors.neutral[200];
        e.currentTarget.style.opacity = isArchived ? '0.72' : '1';
      }}
    >
      {/* Left control: archived rows show a restore CTA in place of the complete toggle. */}
      {isArchived ? (
        canEdit && onUnarchive ? (
          <button
            onClick={handleUnarchive}
            disabled={isUnarchiving}
            title="Unarchive subtask"
            aria-label="Unarchive subtask"
            style={{
              width: 22,
              height: 22,
              padding: 0,
              border: 'none',
              borderRadius: 4,
              backgroundColor: 'transparent',
              color: tokens.colors.primary[600],
              cursor: isUnarchiving ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              opacity: isUnarchiving ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = tokens.colors.primary[50]; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <ArchiveRestore size={15} />
          </button>
        ) : (
          <div style={{ width: 22, height: 22, flexShrink: 0 }} />
        )
      ) : canEdit ? (
        <button
          onClick={handleToggle}
          disabled={isToggling}
          style={{
            width: 17,
            height: 17,
            padding: 0,
            border: `1.5px solid ${subtask.completed ? tokens.colors.success[600] : tokens.colors.neutral[400]}`,
            borderRadius: '50%',
            backgroundColor: subtask.completed ? tokens.colors.success[600] : 'white',
            cursor: canEdit ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
        >
          {subtask.completed && <Check size={11} color="white" strokeWidth={3.5} />}
        </button>
      ) : (
        <div
          style={{
            width: 17,
            height: 17,
            border: `1.5px solid ${subtask.completed ? tokens.colors.success[600] : tokens.colors.neutral[400]}`,
            borderRadius: '50%',
            backgroundColor: subtask.completed ? tokens.colors.success[600] : 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {subtask.completed && <Check size={11} color="white" strokeWidth={3.5} />}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 450,
            color: subtask.completed ? tokens.colors.neutral[500] : tokens.colors.neutral[900],
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtask.title}
          </span>
          <span
            style={{
              fontSize: 11,
              color: tokens.colors.neutral[500],
              fontWeight: 400,
              flexShrink: 0,
            }}
          >
            {subtask.key}
          </span>
          {isArchived && (
            <span
              title="This subtask is archived"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: tokens.colors.neutral[600],
                backgroundColor: tokens.colors.neutral[200],
                padding: '1px 6px',
                borderRadius: 4,
                flexShrink: 0,
              }}
            >
              Archived
            </span>
          )}
          {(() => {
            const current = subtask.priority;
            const color = current ? PRIORITY_COLORS[current] || tokens.colors.neutral[500] : tokens.colors.neutral[400];
            const label = current ? PRIORITY_LABELS[current] || current : 'None';
            const editable = canEdit && !!onChangePriority;

            const chip = (
              <span
                title={`Priority: ${label}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  color,
                  backgroundColor: `${color}1A`,
                  padding: '1px 6px',
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color }} />
                {label}
                {editable && <ChevronDown size={10} />}
              </span>
            );

            if (!editable) {
              return current ? chip : null;
            }

            return (
              <div style={{ display: 'inline-flex', flexShrink: 0 }}>
                <button
                  ref={triggerRef}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (showPriorityMenu) setShowPriorityMenu(false);
                    else openPriorityMenu();
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    display: 'inline-flex',
                  }}
                >
                  {chip}
                </button>
                {showPriorityMenu && menuPos && createPortal(
                  <div
                    ref={menuRef}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'fixed',
                      top: menuPos.top,
                      left: menuPos.left,
                      minWidth: 120,
                      backgroundColor: 'white',
                      border: `1px solid ${tokens.colors.neutral[300]}`,
                      borderRadius: 8,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                      zIndex: 100000,
                      padding: 4,
                    }}
                  >
                    {PRIORITY_ORDER.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPriorityMenu(false);
                          if (p !== current) onChangePriority!(subtask.id, p);
                        }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 8px',
                          fontSize: 12,
                          fontWeight: 500,
                          textAlign: 'left',
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                          backgroundColor: p === current ? tokens.colors.primary[50] : 'transparent',
                          color: tokens.colors.neutral[800],
                        }}
                        onMouseEnter={(e) => {
                          if (p !== current) e.currentTarget.style.backgroundColor = tokens.colors.neutral[50];
                        }}
                        onMouseLeave={(e) => {
                          if (p !== current) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: PRIORITY_COLORS[p],
                          }}
                        />
                        {PRIORITY_LABELS[p]}
                      </button>
                    ))}
                  </div>,
                  document.body
                )}
              </div>
            );
          })()}
        </div>
        {subtask.assignee && (
          <div
            style={{
              fontSize: 12,
              color: tokens.colors.neutral[600],
              marginTop: 2,
            }}
          >
            Assigned to {subtask.assignee.name}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {canEdit && onPromote && !isArchived && (
          <button
            onClick={async (event) => {
              event.stopPropagation();
              if (isPromoting) return;
              setIsPromoting(true);
              try {
                await onPromote(subtask.id);
              } finally {
                setIsPromoting(false);
              }
            }}
            disabled={isPromoting}
            title="Make this a main task"
            aria-label="Make this a main task"
            style={{
              background: 'none',
              border: 'none',
              padding: 4,
              cursor: isPromoting ? 'default' : 'pointer',
              color: tokens.colors.neutral[500],
              display: 'flex',
              alignItems: 'center',
              borderRadius: 4,
              opacity: isPromoting ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = tokens.colors.neutral[100];
              e.currentTarget.style.color = tokens.colors.neutral[800];
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = tokens.colors.neutral[500];
            }}
          >
            <ArrowUpRight size={15} />
          </button>
        )}
        {canEdit && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            style={{
              background: 'none',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              color: tokens.colors.error[500],
              display: 'flex',
              alignItems: 'center',
              borderRadius: 4,
              opacity: isDeleting ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = tokens.colors.error[50];
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Trash2 size={14} />
          </button>
        )}
        <ChevronRight size={16} color={tokens.colors.neutral[400]} />
      </div>
    </div>
  );
}
