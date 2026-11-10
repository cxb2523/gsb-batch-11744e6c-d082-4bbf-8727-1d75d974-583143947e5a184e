'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { ISSUE_TYPE_ICON } from './issueTypeMeta';

interface BreadcrumbItem {
  id: number;
  key: string;
  title: string;
  type: 'epic' | 'story' | 'task' | 'bug';
}

interface IssueHierarchyBreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate: (issueId: number) => void;
}

const ISSUE_TYPE_COLORS: Record<string, string> = {
  epic: tokens.colors.neon.purple,
  story: tokens.colors.primary[500],
  task: tokens.colors.success[500],
  bug: tokens.colors.error[500],
  subtask: tokens.colors.neutral[500],
};

export default function IssueHierarchyBreadcrumb({
  items,
  onNavigate,
}: IssueHierarchyBreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        backgroundColor: tokens.colors.neutral[50],
        borderRadius: 6,
        fontSize: 13,
        overflow: 'hidden',
      }}
    >
      {items.map((item, index) => (
        <React.Fragment key={item.id}>
          {index > 0 && (
            <ChevronRight
              size={14}
              color={tokens.colors.neutral[400]}
              style={{ flexShrink: 0 }}
            />
          )}
          <button
            onClick={() => onNavigate(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: tokens.fontFamily.sans,
              color: tokens.colors.neutral[700],
              transition: 'background-color 0.15s',
              maxWidth: 250,
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = tokens.colors.neutral[100];
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {(() => {
              const Icon = ISSUE_TYPE_ICON[item.type];
              return Icon ? (
                <Icon
                  size={14}
                  color={ISSUE_TYPE_COLORS[item.type] || tokens.colors.neutral[600]}
                  style={{ flexShrink: 0 }}
                />
              ) : null;
            })()}
            <span
              style={{
                fontWeight: 600,
                color: ISSUE_TYPE_COLORS[item.type] || tokens.colors.neutral[600],
                flexShrink: 0,
              }}
            >
              {item.key}
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.title}
            </span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
