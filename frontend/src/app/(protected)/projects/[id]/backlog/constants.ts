// The backlog loads newest-first in pages rather than fetching every ticket at
// once. 50 mirrors the board's COLUMN_PAGE_SIZE.
export const BACKLOG_PAGE_SIZE = 50;

// Status, priority and issue-type color palette
export const COLORS = {
  primary: '#0052CC',
  background: '#F4F5F7',
  cardBg: '#FFFFFF',
  textPrimary: '#172B4D',
  textSecondary: '#5E6C84',
  textTertiary: '#8993A4',
  border: '#DFE1E6',
  hoverBg: '#EBECF0',
  activeBg: '#DEEBFF',
};

// Type badge colors
export const TYPE_COLORS = {
  epic: { bg: '#F3F0FF', text: '#6554C0', border: '#DFD8FD' },
  story: { bg: '#DEEBFF', text: '#0052CC', border: '#B3D4FF' },
  task: { bg: '#E3FCEF', text: '#006644', border: '#ABF5D1' },
  bug: { bg: '#FFEBE6', text: '#BF2600', border: '#FFBDAD' },
  feature: { bg: '#DEEBFF', text: '#0052CC', border: '#B3D4FF' },
  campaign: { bg: '#EAE6FF', text: '#5243AA', border: '#C0B6F2' },
  design: { bg: '#F3F0FF', text: '#6554C0', border: '#DFD8FD' },
  engineering: { bg: '#E3FCEF', text: '#006644', border: '#ABF5D1' },
};
