'use client';

import React from 'react';
import {
  Calendar,
  CheckSquare,
  MoreHorizontal,
  Check,
  Square,
  ExternalLink,
  UserPlus,
  Link2,
  Archive,
  ArchiveRestore,
  Trash2,
} from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { priorityColor, type Priority } from '../../lib/priority';

export interface IssueCardData {
  id: number;
  key: string;
  title: string;
  type: 'task' | 'bug' | 'story' | 'epic';
  statusId?: number;
  /** Status held before the issue was Blocked; used by the one-step transition cap. */
  preBlockStatusId?: number | null;
  priority?: Priority;
  assignee?: {
    id: number;
    name: string;
    initials: string;
  };
  epicId?: number;
  labels?: { id: number; name: string; color: string }[];
  storyPoints?: number;
  subtasksCompleted?: number;
  subtasksTotal?: number;
  dueDate?: string;
  archived?: boolean;
  /** Used to decide whether this user may delete the issue (reporter or admin). */
  reporterEmail?: string;
  /** Merge request / PR link, used to gate moving the issue to Done. */
  mergeRequestUrl?: string;
}

/** Actions offered by the card's "..." menu. The board supplies the handlers. */
export interface IssueCardActions {
  onOpen: () => void;
  onAssignToMe?: () => void;
  onCopyLink?: () => void;
  onToggleArchive?: () => void;
  onDelete?: () => void;
}

interface IssueCardProps {
  issue: IssueCardData;
  onDragStart: (e: React.DragEvent, issue: IssueCardData) => void;
  onDragEnd: () => void;
  onClick: (e?: React.MouseEvent) => void;
  isDragged: boolean;
  isSelected?: boolean;
  onSelectToggle?: (e: React.MouseEvent) => void;
  /** Handlers for the "..." menu. Omit an action to hide that item. */
  actions?: Omit<IssueCardActions, 'onOpen'>;
}

// Type icons
const TypeIcon: React.FC<{ type: string }> = ({ type }) => {
  const iconStyle = {
    width: 16,
    height: 16,
    borderRadius: '3px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 700,
    fontFamily: tokens.fontFamily.sans,
  };

  switch (type) {
    case 'task':
      return (
        <div style={{ ...iconStyle, backgroundColor: '#0052CC', color: '#fff' }}>
          T
        </div>
      );
    case 'bug':
      return (
        <div style={{ ...iconStyle, backgroundColor: '#E34935', color: '#fff' }}>
          B
        </div>
      );
    case 'story':
      return (
        <div style={{ ...iconStyle, backgroundColor: '#00875A', color: '#fff' }}>
          S
        </div>
      );
    case 'epic':
      return (
        <div style={{ ...iconStyle, backgroundColor: '#6554C0', color: '#fff' }}>
          E
        </div>
      );
    default:
      return (
        <div style={{ ...iconStyle, backgroundColor: '#8993A4', color: '#fff' }}>
          ?
        </div>
      );
  }
};

// Priority indicator
const PriorityIndicator: React.FC<{ priority?: string }> = ({ priority }) => {
  if (!priority) return null;

  const color = priorityColor(priority);

  return (
    <div
      style={{
        width: 16,
        height: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title={`Priority: ${priority.toUpperCase()}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2L10 6H6L8 2Z" fill={color} />
        {priority === 'urgent' && (
          <>
            <path d="M8 6L10 10H6L8 6Z" fill={color} />
            <path d="M8 10L10 14H6L8 10Z" fill={color} />
          </>
        )}
        {priority === 'high' && (
          <path d="M8 6L10 10H6L8 6Z" fill={color} />
        )}
      </svg>
    </div>
  );
};

export const IssueCard: React.FC<IssueCardProps> = ({
  issue,
  onDragStart,
  onDragEnd,
  onClick,
  isDragged,
  isSelected = false,
  onSelectToggle,
  actions,
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  const menuItems: { label: string; icon: React.ReactNode; run: () => void; danger?: boolean }[] = [
    { label: 'Open', icon: <ExternalLink size={13} />, run: () => onClick() },
    ...(actions?.onAssignToMe
      ? [{ label: 'Assign to me', icon: <UserPlus size={13} />, run: actions.onAssignToMe }]
      : []),
    ...(actions?.onCopyLink
      ? [{ label: 'Copy link', icon: <Link2 size={13} />, run: actions.onCopyLink }]
      : []),
    ...(actions?.onToggleArchive
      ? [
          {
            label: issue.archived ? 'Unarchive' : 'Archive',
            icon: issue.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />,
            run: actions.onToggleArchive,
          },
        ]
      : []),
    ...(actions?.onDelete
      ? [{ label: 'Delete', icon: <Trash2 size={13} />, run: actions.onDelete, danger: true }]
      : []),
  ];

  const handleDragStart = (e: React.DragEvent) => {
    onDragStart(e, issue);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (onSelectToggle && (e.shiftKey || isSelected)) {
      onSelectToggle(e);
      return;
    }
    onClick(e);
  };

  // Check if due date is overdue
  const isOverdue = issue.dueDate
    ? new Date(issue.dueDate) < new Date()
    : false;

  // Truncate labels to max 3
  const visibleLabels = issue.labels?.slice(0, 3) || [];
  const hiddenLabelsCount = (issue.labels?.length || 0) - visibleLabels.length;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onClick={handleCardClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        background: '#FFFFFF',
        border: `1px solid ${isSelected ? '#0052CC' : isHovered ? '#C1C7D0' : '#E4E6EA'}`,
        boxShadow: isSelected ? '0 0 0 1px #0052CC' : 'none',
        borderRadius: 8,
        padding: '9px 11px',
        marginBottom: 6,
        cursor: isDragged ? 'grabbing' : 'pointer',
        // Archived cards only appear when "Show archived" is on; dim them so they can't be
        // mistaken for live work.
        opacity: isDragged ? 0.5 : issue.archived ? 0.55 : 1,
        transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
      }}
    >
      {issue.archived && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: '#EBECF0',
            color: '#5E6C84',
            border: '1px solid #DFE1E6',
            borderRadius: 3,
            padding: '1px 6px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          Archived
        </div>
      )}

      {/* Selection checkbox: appears on hover or when selected */}
      {onSelectToggle && (isHovered || isSelected) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelectToggle(e);
          }}
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            background: '#FFFFFF',
            border: `1px solid ${isSelected ? '#0052CC' : '#DFE1E6'}`,
            borderRadius: 3,
            padding: 2,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
            width: 18,
            height: 18,
            color: isSelected ? '#FFFFFF' : '#42526E',
            backgroundColor: isSelected ? '#0052CC' : '#FFFFFF',
          }}
          title={isSelected ? 'Deselect' : 'Select'}
        >
          {isSelected ? <Check size={12} /> : <Square size={12} />}
        </button>
      )}
      {/* Header: Type icon + Issue key + Story points */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TypeIcon type={issue.type} />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: '#8993A4',
              letterSpacing: '0.01em',
              fontFamily: tokens.fontFamily.sans,
            }}
          >
            {issue.key}
          </span>
        </div>

        {/* Story points badge */}
        {issue.storyPoints && (
          <div
            style={{
              backgroundColor: '#F4F5F7',
              borderRadius: '10px',
              padding: '1px 7px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#6B778C',
              fontFamily: tokens.fontFamily.sans,
            }}
          >
            {issue.storyPoints}
          </div>
        )}

        {/* Quick actions menu (visible on hover, or while open) */}
        {(isHovered || menuOpen) && menuItems.length > 0 && (
          <div ref={menuRef} style={{ position: 'absolute', top: 4, right: 4 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              title="Issue actions"
              style={{
                background: menuOpen ? '#F4F5F7' : '#FFFFFF',
                border: '1px solid #DFE1E6',
                borderRadius: '3px',
                padding: 4,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: menuOpen ? 1 : 0.8,
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.backgroundColor = '#F4F5F7';
              }}
              onMouseLeave={(e) => {
                if (!menuOpen) {
                  e.currentTarget.style.opacity = '0.8';
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }
              }}
            >
              <MoreHorizontal size={14} color="#42526E" />
            </button>

            {menuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  minWidth: 168,
                  background: '#FFFFFF',
                  border: '1px solid rgba(9,30,66,0.08)',
                  borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(9,30,66,0.18)',
                  zIndex: 1200,
                  padding: '4px 0',
                }}
              >
                {menuItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      item.run();
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 12px',
                      border: 'none',
                      background: 'transparent',
                      textAlign: 'left',
                      fontSize: 13,
                      fontWeight: 500,
                      color: item.danger ? '#DE350B' : '#42526E',
                      cursor: 'pointer',
                      fontFamily: tokens.fontFamily.sans,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = item.danger ? '#FFEBE6' : '#F4F5F7';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Title - 2-line truncate with ellipsis */}
      <div
        style={{
          fontSize: '13.5px',
          fontWeight: 450,
          color: '#172B4D',
          lineHeight: '19px',
          letterSpacing: '-0.008em',
          marginBottom: 8,
          fontFamily: tokens.fontFamily.sans,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          wordBreak: 'break-word',
        }}
        title={issue.title}
      >
        {issue.title}
      </div>

      {/* Labels - max 3 visible */}
      {visibleLabels.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            marginBottom: 8,
          }}
        >
          {visibleLabels.map((label) => (
            <span
              key={label.id}
              style={{
                backgroundColor: label.color || '#E4E6EA',
                color: '#172B4D',
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 10,
                fontFamily: tokens.fontFamily.sans,
                maxWidth: '100px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {label.name}
            </span>
          ))}
          {hiddenLabelsCount > 0 && (
            <span
              style={{
                backgroundColor: '#E4E6EA',
                color: '#626F86',
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 10,
                fontFamily: tokens.fontFamily.sans,
              }}
            >
              +{hiddenLabelsCount}
            </span>
          )}
        </div>
      )}

      {/* Subtask progress */}
      {issue.subtasksTotal && issue.subtasksTotal > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 4,
            }}
          >
            <CheckSquare size={12} color="#5E6C84" />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 500,
                color: '#5E6C84',
                fontFamily: tokens.fontFamily.sans,
              }}
            >
              {issue.subtasksCompleted}/{issue.subtasksTotal}
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: 4,
              backgroundColor: '#F4F5F7',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${((issue.subtasksCompleted || 0) / issue.subtasksTotal) * 100}%`,
                height: '100%',
                backgroundColor: '#0052CC',
                borderRadius: 2,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Footer: Assignee + Priority + Due date */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left: Assignee avatar */}
        <div>
          {issue.assignee ? (
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                backgroundColor: '#0052CC',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 600,
                fontFamily: tokens.fontFamily.sans,
              }}
              title={issue.assignee.name}
            >
              {issue.assignee.initials}
            </div>
          ) : (
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                backgroundColor: '#F4F5F7',
                border: '1px dashed #C1C7D0',
              }}
            />
          )}
        </div>

        {/* Right: Priority + Due date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Due date */}
          {issue.dueDate && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Calendar size={12} color={isOverdue ? '#E34935' : '#5E6C84'} />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: isOverdue ? '#E34935' : '#5E6C84',
                  fontFamily: tokens.fontFamily.sans,
                }}
              >
                {new Date(issue.dueDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          )}

          {/* Priority indicator */}
          <PriorityIndicator priority={issue.priority} />
        </div>
      </div>
    </div>
  );
};
