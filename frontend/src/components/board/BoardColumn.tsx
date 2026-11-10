'use client';

import React from 'react';
import { Plus, Package, ChevronDown, ChevronRight } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { IssueCard, IssueCardData, IssueCardActions } from './IssueCard';

interface BoardColumnProps {
  id: number | string;
  name: string;
  color?: string;
  issues: IssueCardData[];
  /** Opens the create-issue modal, pre-set to this column. */
  onAddIssue: () => void;
  onIssueClick: (issueId: number) => void;
  onDragStart: (e: React.DragEvent, issue: IssueCardData) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, columnId: number | string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, columnId: number | string) => void;
  draggedIssue: IssueCardData | null;
  isDraggingOver: boolean;
  /** True while a card is being dragged that can't legally drop here (transition cap). */
  dropBlocked?: boolean;
  // Multi-select
  selectedIds?: Set<number>;
  onToggleSelect?: (issueId: number, e: React.MouseEvent) => void;
  // Column collapse
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Per-issue "..." menu actions, resolved by the board for each issue. */
  issueActions?: (issue: IssueCardData) => Omit<IssueCardActions, 'onOpen'>;
  /**
   * How many cards this column holds in all, when that is more than are loaded.
   * The board passes the server's count so the header is the size of the column
   * and not the size of the page; the sprint board, which loads its issues whole,
   * passes nothing and keeps counting what it was given.
   */
  totalCount?: number;
  /** Fetches the next cards into this column; absent when there are no more. */
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

export const BoardColumn: React.FC<BoardColumnProps> = ({
  id,
  name,
  color = '#42526E',
  issues,
  onAddIssue,
  onIssueClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  draggedIssue,
  isDraggingOver,
  dropBlocked = false,
  selectedIds,
  onToggleSelect,
  collapsed = false,
  onToggleCollapse,
  issueActions,
  totalCount,
  onLoadMore,
  loadingMore = false,
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const shownCount = totalCount ?? issues.length;
  const hiddenCount = Math.max(0, shownCount - issues.length);

  if (collapsed) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          onDragOver(e, id);
        }}
        onDragLeave={(e) => {
          const relatedTarget = e.relatedTarget as Node | null;
          if (relatedTarget && e.currentTarget.contains(relatedTarget)) {
            return;
          }
          onDragLeave(e);
        }}
        onDrop={(e) => onDrop(e, id)}
        style={{
          minWidth: 48,
          width: 48,
          backgroundColor: '#F7F8F9',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxHeight: '100%',
          border: isDraggingOver ? '2px dashed #4C9AFF' : '2px solid transparent',
          transition: 'border-color 0.15s ease',
          padding: '8px 4px',
          gap: 8,
        }}
        title={`${name} (${issues.length})`}
      >
        <button
          onClick={onToggleCollapse}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 2,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 3,
          }}
          title="Expand column"
        >
          <ChevronRight size={16} color="#42526E" />
        </button>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: color,
          }}
        />
        <div
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: 13,
            fontWeight: 600,
            color: '#5E6C84',

            letterSpacing: '0.04em',
            fontFamily: tokens.fontFamily.sans,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxHeight: 180,
          }}
        >
          {name}
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#5E6C84',
            background: '#EBECF0',
            borderRadius: 10,
            padding: '2px 6px',
            fontFamily: tokens.fontFamily.sans,
          }}
        >
          {shownCount}
        </span>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(e, id);
      }}
      onDragLeave={(e) => {
        const relatedTarget = e.relatedTarget as Node | null;
        if (relatedTarget && e.currentTarget.contains(relatedTarget)) {
          return;
        }
        onDragLeave(e);
      }}
      onDrop={(e) => onDrop(e, id)}
      style={{
        minWidth: 296,
        width: 296,
        // A blocked target reads as "not here": dimmed, muted, never the drop highlight.
        backgroundColor: dropBlocked ? '#F7F8F9' : (isDraggingOver ? '#E9F2FF' : '#F7F8F9'),
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '100%',
        border: dropBlocked
          ? '2px solid transparent'
          : (isDraggingOver ? '2px dashed #4C9AFF' : '2px solid transparent'),
        opacity: dropBlocked ? 0.45 : 1,
        cursor: dropBlocked ? 'not-allowed' : undefined,
        transition: 'background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Column Header */}
      <div
        style={{
          padding: '12px 12px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        {/* Left: Name + Count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Collapse column"
            >
              <ChevronDown size={14} color="#42526E" />
            </button>
          )}
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: color,
            }}
          />
          <h3
            style={{
              margin: 0,
              fontSize: '13px',
              fontWeight: 600,
              color: '#172B4D',
              letterSpacing: '-0.006em',
              fontFamily: tokens.fontFamily.sans,
            }}
          >
            {name}
          </h3>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#8993A4',
              background: 'transparent',
              borderRadius: 10,
              padding: '1px 7px',
              lineHeight: '16px',
              fontFamily: tokens.fontFamily.sans,
            }}
          >
            {shownCount}
          </span>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Add issue button */}
          <button
            onClick={onAddIssue}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              borderRadius: '3px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isHovered ? 1 : 0,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#EBECF0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title="Add issue"
          >
            <Plus size={16} color="#42526E" />
          </button>
        </div>
      </div>

      {/* Issues List - Scrollable */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '0 10px 10px',
          minHeight: 100,
        }}
      >
        {issues.length > 0 ? (
          <>
            {issues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onClick={() => onIssueClick(issue.id)}
                isDragged={draggedIssue?.id === issue.id}
                isSelected={selectedIds?.has(issue.id) || false}
                onSelectToggle={
                  onToggleSelect
                    ? (e) => onToggleSelect(issue.id, e)
                    : undefined
                }
                actions={issueActions?.(issue)}
              />
            ))}
            {onLoadMore && (
              <button
                onClick={onLoadMore}
                disabled={loadingMore}
                style={{
                  width: '100%',
                  background: '#FFFFFF',
                  border: '1px solid #DFE1E6',
                  borderRadius: 3,
                  padding: '6px 8px',
                  marginTop: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#44546F',
                  cursor: loadingMore ? 'default' : 'pointer',
                  fontFamily: tokens.fontFamily.sans,
                }}
              >
                {loadingMore
                  ? 'Loading...'
                  : hiddenCount > 0
                    ? `Load ${Math.min(hiddenCount, 50)} more of ${hiddenCount}`
                    : 'Load more'}
              </button>
            )}
            {(
              <button
                onClick={onAddIssue}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 3,
                  padding: '6px 8px',
                  textAlign: 'left',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#5E6C84',
                  cursor: 'pointer',
                  fontFamily: tokens.fontFamily.sans,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: isHovered ? 1 : 0,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#EBECF0';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Plus size={14} />
                Create issue
              </button>
            )}
          </>
        ) : (
          /* Empty state */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                backgroundColor: '#EBECF0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Package size={24} color="#C1C7D0" />
            </div>
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                fontWeight: 400,
                color: '#8993A4',
                fontFamily: tokens.fontFamily.sans,
                marginBottom: 8,
              }}
            >
              No issues yet
            </p>
            <button
              onClick={onAddIssue}
              style={{
                background: 'transparent',
                border: '1px solid #DFE1E6',
                borderRadius: '3px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#42526E',
                cursor: 'pointer',
                fontFamily: tokens.fontFamily.sans,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#EBECF0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <Plus size={14} />
              Create issue
            </button>
          </div>
        )}

        {/* Drop zone indicator */}
        {isDraggingOver && (
          <div
            style={{
              border: '2px dashed #0052CC',
              borderRadius: '3px',
              padding: 16,
              textAlign: 'center',
              backgroundColor: 'rgba(0, 82, 204, 0.04)',
              color: '#0052CC',
              fontSize: '12px',
              fontWeight: 500,
              fontFamily: tokens.fontFamily.sans,
              marginTop: issues.length > 0 ? 8 : 0,
            }}
          >
            Drop here
          </div>
        )}
      </div>
    </div>
  );
};
