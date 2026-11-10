import React from 'react';

export type ViewMode = 'card' | 'table';
export type SortField = 'title' | 'status' | 'progress' | 'due_date' | 'assignee';
export type SortDirection = 'asc' | 'desc';

export interface StatusVisual {
  label: string;
  color: string;
  bg: string;
}

export const STATUS_VISUALS: Record<string, StatusVisual> = {
  planned: { label: 'Planned', color: '#5E6C84', bg: '#F4F5F7' },
  in_progress: { label: 'In Progress', color: '#0052CC', bg: '#DEEBFF' },
  completed: { label: 'Completed', color: '#00875A', bg: '#E3FCEF' },
  cancelled: { label: 'Cancelled', color: '#97A0AF', bg: '#F4F5F7' },
};

export const getStatusVisual = (status: string): StatusVisual =>
  STATUS_VISUALS[status] || { label: status, color: '#5E6C84', bg: '#F4F5F7' };

export const statusOptions: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const sortOptions: { value: SortField; label: string }[] = [
  { value: 'due_date', label: 'Due date' },
  { value: 'title', label: 'Title' },
  { value: 'status', label: 'Status' },
  { value: 'progress', label: 'Progress' },
  { value: 'assignee', label: 'Assignee' },
];

export const secondaryBtn: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  color: '#42526E',
  border: '1px solid #DFE1E6',
  borderRadius: 3,
  padding: '0 8px',
  height: 32,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontFamily: 'var(--font-sans)',
  transition: 'background-color 0.15s ease',
};
