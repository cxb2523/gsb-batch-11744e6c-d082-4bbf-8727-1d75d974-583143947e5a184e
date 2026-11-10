import React from 'react';
import { tokens } from '../tokens';

export interface SettingsTabItem {
  id: string;
  label: string;
}

export interface SettingsTabsProps {
  items: SettingsTabItem[];
  activeId: string;
  onChange?: (id: string) => void;
}

export const SettingsTabs: React.FC<SettingsTabsProps> = ({ items, activeId, onChange }) => {
  // A single tab is not a choice, so there is nothing to switch between: the strip
  // would just be a label sitting under the heading that already says the same thing.
  if (items.length < 2) {
    return null;
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        backgroundColor: '#ececf0',
        borderRadius: 14,
        padding: 3.5,
        gap: 0,
        fontFamily: tokens.fontFamily.sans,
        height: 36
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
              flex: 1,
              paddingInline: 9,
              paddingBlock: 5,
              borderRadius: 14,
              border: 'none',
              backgroundColor: isActive ? tokens.colors.semantic.background.default : 'transparent',
              cursor: 'pointer',
              color: tokens.colors.neutral[900],
              fontSize: tokens.typography.sizes.sm,
              fontWeight: tokens.typography.weights.semibold,
              lineHeight: '20px',
              whiteSpace: 'nowrap',
              transition: 'background-color 200ms'
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
};
