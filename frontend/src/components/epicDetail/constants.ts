import type { StatusCategory } from '@/lib/statusVisual';

export interface Ticket {
  id: number;
  key: string;
  title: string;
  status_name?: string;
  status_color?: string | null;
  status_category?: StatusCategory | null;
  epic_id?: number;
}

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
