import React from 'react';
import { tokens } from '../../../../../design-system/tokens';

interface NoFilterMatchBannerProps {
  hiddenCount: number;
  activeFilterCount: number;
  onClear: () => void;
}

export function NoFilterMatchBanner({ hiddenCount, activeFilterCount, onClear }: NoFilterMatchBannerProps) {
  return (
    <div
      style={{
        margin: '0 24px 12px',
        padding: '14px 16px',
        background: '#FFFAE6',
        border: '1px solid #FFE380',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        fontFamily: tokens.fontFamily.sans,
      }}
    >
      <div style={{ fontSize: 13, color: '#172B4D' }}>
        <strong>No issues match your filters.</strong>{' '}
        <span style={{ color: '#5E6C84' }}>
          {hiddenCount} issue{hiddenCount === 1 ? ' is' : 's are'} hidden by{' '}
          {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}.
        </span>
      </div>
      <button
        onClick={onClear}
        style={{
          flexShrink: 0,
          background: '#FFFFFF',
          border: '1px solid #DFE1E6',
          borderRadius: 3,
          padding: '6px 12px',
          fontSize: 13,
          fontWeight: 500,
          color: '#42526E',
          cursor: 'pointer',
          fontFamily: tokens.fontFamily.sans,
        }}
      >
        Clear filters
      </button>
    </div>
  );
}
