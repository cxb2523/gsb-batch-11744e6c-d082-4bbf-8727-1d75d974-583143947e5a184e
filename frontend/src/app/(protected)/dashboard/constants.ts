import React from 'react';

// ==================== PALETTE ====================
// Hardcoded palette per the spec. Do NOT swap to design tokens.
export const C = {
  pageBg: '#F4F5F7',
  cardBg: '#FFFFFF',
  border: '#DFE1E6',
  borderSubtle: '#EBECF0',
  heading: '#172B4D',
  body: '#42526E',
  subtle: '#5E6C84',
  muted: '#6B778C',
  disabled: '#97A0AF',
  link: '#0052CC',
  linkHover: '#0747A6',
  danger: '#DE350B',
  dangerBg: '#FFEBE6',
  success: '#00875A',
  successBg: '#E3FCEF',
  warning: '#FF991F',
  warningBg: '#FFF7E6',
  inProgress: '#0052CC',
  inProgressBg: '#DEEBFF',
  blocked: '#DE350B',
  blockedBg: '#FFEBE6',
  testing: '#5243AA',
  testingBg: '#EAE6FF',
};

export const CARD: React.CSSProperties = {
  background: C.cardBg,
  border: `1px solid ${C.border}`,
  borderRadius: 3,
};

export const statusChipStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 3,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.3,
  whiteSpace: 'nowrap' as const,
  flexShrink: 0,
};
