import { ProjectMember } from '../../../../../lib/api/settings';

export interface Member extends ProjectMember {
  assignedIssues: number;
  initials: string;
  lastActive?: string;
  selected?: boolean;
}

export type SortField = 'name' | 'role' | 'assignedIssues' | 'lastActive';
export type SortDirection = 'asc' | 'desc';

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}
