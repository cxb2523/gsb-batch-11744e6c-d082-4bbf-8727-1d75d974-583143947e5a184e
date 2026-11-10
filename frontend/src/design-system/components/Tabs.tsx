import React from 'react';
import { tokens } from '../tokens';

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange?: (id: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ items, activeId, onChange }) => {
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: tokens.spacing[2],
        borderBottom: `1px solid ${tokens.colors.neutral[200]}`,
        fontFamily: tokens.fontFamily.sans
      }}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange?.(item.id)}
            style={{
              paddingInline: tokens.spacing[3],
              paddingBlock: tokens.spacing[2],
              borderRadius: tokens.borderRadius.sm,
              border: 'none',
              borderBottom: isActive ? `2px solid ${tokens.colors.primary[500]}` : '2px solid transparent',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              color: isActive ? tokens.colors.neutral[900] : tokens.colors.neutral[600],
              fontSize: tokens.typography.styles.bodyMedium.fontSize,
              fontWeight: isActive ? tokens.typography.weights.semibold : tokens.typography.styles.bodyMedium.fontWeight
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
};


