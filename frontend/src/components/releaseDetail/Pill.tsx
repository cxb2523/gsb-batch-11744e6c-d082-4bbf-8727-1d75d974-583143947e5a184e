import React from 'react';

export const Pill: React.FC<{ label: string; color: string; bg: string; small?: boolean }> = ({ label, color, bg, small }) => (
  <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    padding: small ? '2px 6px' : '3px 8px',
    fontSize: small ? 11 : 12,
    fontWeight: 500,
    color,
    backgroundColor: bg,
    borderRadius: 3,
    whiteSpace: 'nowrap',
    lineHeight: 1.4,
  }}>
    {label}
  </span>
);
