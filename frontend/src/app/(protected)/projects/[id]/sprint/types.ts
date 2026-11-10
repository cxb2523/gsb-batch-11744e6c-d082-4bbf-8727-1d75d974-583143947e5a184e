import type { Priority } from '@/lib/priority';

export interface IssueCard {
  id: number;
  key: string;
  title: string;
  description?: string;
  type: 'task' | 'bug' | 'story' | 'epic' | 'subtask' | 'campaign' | 'design' | 'engineering';
  statusId: number;
  priority?: Priority;
  assignee?: {
    id: number;
    name: string;
    initials: string;
  };
  storyPoints?: number;
  epicId?: number;
  epicName?: string;
  labels?: string[];
  mergeRequestUrl?: string;
}

export type GroupBy = 'none' | 'assignee' | 'epic';
