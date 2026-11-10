import type { StatusCategory } from '@/lib/statusVisual';

export interface SummaryTicket {
  id: number;
  key: string;
  title: string;
  status: string;
  status_id?: number;
  status_color?: string | null;
  status_category?: StatusCategory | null;
  project_id: number;
  project_key: string;
  project_name: string;
  priority?: string;
  type?: string;
  due_date?: string;
  updated_at?: string;
}

export interface SprintInfo {
  id: number;
  project_id: number;
  project_key: string;
  project_name: string;
  name: string;
  goal?: string;
  end_date?: string;
  days_remaining?: number;
  total_tickets: number;
  completed_tickets: number;
  my_tickets: number;
  progress_percentage: number;
}

export interface EpicInfo {
  id: number;
  key: string;
  title: string;
  project_id: number;
  project_key: string;
  project_name: string;
  status: string;
  due_date?: string;
  total_tickets: number;
  completed_tickets: number;
  progress_percentage: number;
}

export interface ReleaseInfo {
  id: number;
  name: string;
  version: string;
  status: string;
  release_date?: string;
  project_id: number;
  project_key: string;
  project_name: string;
}

export interface ActivityRow {
  id: number;
  project_id: number;
  project_key: string;
  issue_key: string;
  issue_title: string;
  action: string;
  user_name: string;
  timestamp: string;
}

export interface Summary {
  counts: {
    overdue: number;
    due_today: number;
    blocked: number;
    in_progress: number;
    at_risk: number;
    urgent_open: number;
  };
  overdue: SummaryTicket[];
  due_today: SummaryTicket[];
  blocked: SummaryTicket[];
  urgent_open: SummaryTicket[];
  in_progress: SummaryTicket[];
  at_risk: SummaryTicket[];
  active_sprints: SprintInfo[];
  my_epics: EpicInfo[];
  upcoming_releases: ReleaseInfo[];
  recent_activity: ActivityRow[];
  quick_stats: {
    created_this_week: number;
    completed_this_week: number;
    hours_logged_this_week: number;
  };
}
