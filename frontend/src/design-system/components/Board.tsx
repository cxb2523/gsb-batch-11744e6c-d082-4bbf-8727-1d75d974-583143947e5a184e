import React from 'react';
import { tokens } from '../tokens';
import { Card } from './Card';
import { Avatar } from './Avatar';

export interface WorkItem {
  id: string;
  key: string;
  title: string;
  status: 'backlog' | 'todo' | 'inProgress' | 'done';
  assignees: string[];
  dueDate?: string;
}

export interface BoardColumnProps {
  id: string;
  title: string;
  count: number;
  items: WorkItem[];
}

export const BoardColumn: React.FC<BoardColumnProps> = ({ title, count, items }) => {
  return (
    <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: tokens.spacing[2] }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingInline: tokens.spacing[3],
          paddingBlock: tokens.spacing[2]
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[2], fontFamily: tokens.fontFamily.sans }}>
          <span>{title}</span>
          <span
            style={{
              fontSize: tokens.typography.styles.caption.fontSize,
              color: tokens.colors.neutral[600]
            }}
          >
            {count}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing[2] }}>
        {items.map((item) => (
          <WorkItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
};

export interface WorkItemCardProps {
  item: WorkItem;
}

export const WorkItemCard: React.FC<WorkItemCardProps> = ({ item }) => {
  return (
    <Card
      style={{
        padding: tokens.spacing[3],
        borderRadius: tokens.borderRadius.md
      }}
    >
      <div
        style={{
          marginBottom: tokens.spacing[2],
          display: 'inline-flex',
          alignItems: 'center',
          paddingInline: tokens.spacing[2],
          paddingBlock: tokens.spacing[1],
          borderRadius: tokens.borderRadius.pill,
          backgroundColor: tokens.colors.neutral[100],
          fontSize: tokens.typography.styles.caption.fontSize,
          fontFamily: tokens.fontFamily.sans
        }}
      >
        {item.key}
      </div>
      <div
        style={{
          marginBottom: tokens.spacing[3],
          fontFamily: tokens.fontFamily.sans,
          fontSize: tokens.typography.styles.bodyMedium.fontSize,
          lineHeight: `${tokens.typography.styles.bodyMedium.lineHeight}px`,
          color: tokens.colors.neutral[900]
        }}
      >
        {item.title}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: tokens.spacing[2]
          }}
        >
          {item.dueDate && (
            <span
              style={{
                fontSize: tokens.typography.styles.caption.fontSize,
                color: tokens.colors.neutral[600],
                fontFamily: tokens.fontFamily.sans
              }}
            >
              {item.dueDate}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[1] }}>
          {item.assignees.map((name) => (
            <Avatar key={name} name={name} size={20} />
          ))}
        </div>
      </div>
    </Card>
  );
};


