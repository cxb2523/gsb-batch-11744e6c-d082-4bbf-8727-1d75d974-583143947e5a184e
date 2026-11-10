const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Helper function to handle API responses
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export interface TicketTrend {
  direction: 'up' | 'down' | 'stable';
  percentage: number;
}

export interface PeriodMetrics {
  period: string;
  start_date: string;
  end_date: string;
  tickets_created: number;
  tickets_completed: number;
  tickets_updated: number;
  open_tickets: number;
  by_type: Record<string, number>;
  by_priority: Record<string, number>;
  by_assignee: Record<string, number>;
  status_distribution: Record<string, number>;
}

export interface TopContributor {
  name: string;
  tickets_created: number;
}

export interface StatusBreakdown {
  [status: string]: {
    total: number;
    created_this_period: number;
    completed_this_period: number;
    updated_this_period: number;
    by_type: Record<string, number>;
    by_priority: Record<string, number>;
    is_done_status: boolean;
  };
}

export interface StatusReport {
  project_id: number;
  generated_at: string;
  report_type: 'daily' | 'weekly';
  summary: {
    // Creation metrics
    total_tickets_created: number;
    avg_created_per_period: number;
    current_period_created: number;
    previous_period_created: number;
    creation_trend: TicketTrend;

    // Completion metrics
    total_tickets_completed: number;
    avg_completed_per_period: number;
    current_period_completed: number;
    previous_period_completed: number;
    completion_trend: TicketTrend;

    // Other metrics
    total_tickets_updated: number;
    current_open_tickets: number;
    velocity_rate: number;
  };
  periods: PeriodMetrics[];
  top_contributors: TopContributor[];
  metadata: {
    period_type: string;
    period_count: number;
    start_date: string | null;
    end_date: string | null;
  };
  status_breakdown?: StatusBreakdown;
}

export interface ProjectComparison {
  project_id: number;
  project_name: string;
  total_created: number;
  total_completed: number;
  avg_created_per_period: number;
  avg_completed_per_period: number;
  current_period_created: number;
  current_period_completed: number;
  creation_trend: TicketTrend;
  completion_trend: TicketTrend;
  velocity_rate: number;
  current_open_tickets: number;
}

export interface ComparisonReport {
  generated_at: string;
  period: 'daily' | 'weekly';
  projects: ProjectComparison[];
  summary: {
    total_projects: number;
    total_tickets_created: number;
    total_tickets_completed: number;
    avg_velocity: number;
    most_active_project: ProjectComparison | null;
  };
}

// Comprehensive report types
export interface StatusMetrics {
  count: number;
  tickets: Array<{
    id: number;
    key: string;
    title: string;
    assignee: string;
    created_at: string | null;
    age_days: number;
  }>;
  by_assignee: Record<string, number>;
  by_type: Record<string, number>;
  by_priority: Record<string, number>;
  average_age_days: number;
}

export interface TransitionMetrics {
  most_common_transitions: Array<{
    from: string;
    to: string;
    count: number;
  }>;
  bottleneck_statuses: Array<{
    status: string;
    ticket_count: number;
    transitions_out: number;
  }>;
  average_time_in_status: Record<string, number>;
}

export interface AssigneeMetric {
  total_assigned: number;
  by_status: Record<string, number>;
  completed: number;
  in_progress: number;
  blocked: number;
}

export interface ComprehensivePeriod {
  period: string;
  start_date: string;
  end_date: string;
  tickets_created: number;
  tickets_completed: number;
  status_distribution: Record<string, number>;
  transitions: Record<string, Record<string, number>>;
}

export interface ComprehensiveStatusReport {
  project_id: number;
  generated_at: string;
  report_type: 'daily' | 'weekly';
  summary: {
    total_tickets: number;
    total_statuses: number;
    done_tickets: number;
    in_progress_tickets: number;
    blocked_tickets: number;
    unassigned_tickets: number;
  };
  status_distribution: Record<string, StatusMetrics>;
  periods: ComprehensivePeriod[];
  velocity_metrics: {
    current_period_velocity: number;
    average_velocity: number;
    trend: 'stable' | 'improving' | 'declining';
  };
  assignee_metrics: Record<string, AssigneeMetric>;
  transition_metrics: TransitionMetrics;
  all_statuses: string[];
  metadata: {
    period_type: string;
    period_count: number;
    start_date: string | null;
    end_date: string | null;
  };
}

// Stand-up report types
export interface StandupTicket {
  ticket_id: number;
  key: string;
  title: string;
  assignee: string;
  type: string;
  priority: string;
  status?: string;
  age_days?: number;
  created_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  current_status?: string;
  status_changed_from?: string;
  status_changed_to?: string;
  blocked_at?: string | null;
  blocked_from_status?: string;
  blocked_duration_days?: number;
}

export interface StatusTransition {
  ticket_id: number;
  key: string;
  title: string;
  assignee: string;
  from_status: string;
  to_status: string;
  changed_at: string | null;
  changed_by: string;
  type: string;
  priority: string;
  is_regression: boolean;
  regression_type?: string;
}

export interface StandupReport {
  project_id: number;
  assignee_id?: number | null;
  generated_at: string;
  report_date: string;
  report_day: string;
  yesterday: {
    date: string;
    completed: StandupTicket[];
    worked_on: StandupTicket[];
    summary: {
      tickets_completed: number;
      tickets_worked_on: number;
      total_activity: number;
    };
  };
  today: {
    date: string;
    in_progress: StandupTicket[];
    created_today: StandupTicket[];
    summary: {
      tickets_in_progress: number;
      tickets_created_today: number;
      high_priority_in_progress: number;
    };
  };
  blockers: {
    blocked_tickets: StandupTicket[];
    regression_transitions: StatusTransition[];
    summary: {
      total_blocked: number;
      critical_regressions: number;
      total_regressions: number;
      longest_blocked_days: number;
    };
  };
  transitions: {
    all_transitions: StatusTransition[];
    by_type: {
      to_done: number;
      to_in_progress: number;
      to_blocked: number;
      regressions: number;
    };
    summary: {
      total_transitions: number;
      regression_count: number;
    };
  };
  summary: {
    total_tickets: number;
    by_status: Record<string, number>;
    by_assignee: Record<string, number>;
    velocity_7_days: number;
    avg_daily_completion: number;
  };
  metadata: {
    yesterday_start: string;
    yesterday_end: string;
    today_start: string;
    current_time: string;
    week_start: string;
  };
}

export interface TeamMemberReport {
  user_id: number;
  name: string;
  email?: string;
  yesterday_completed: number;
  yesterday_worked_on: number;
  today_in_progress: number;
  blocked: number;
  regressions: number;
  completed_tickets: StandupTicket[];
  in_progress_tickets: StandupTicket[];
  blocked_tickets: StandupTicket[];
}

export interface TeamStandupReport {
  project_id: number;
  generated_at: string;
  report_date: string;
  report_day: string;
  overall: StandupReport;
  team_members: TeamMemberReport[];
  team_summary: {
    total_members: number;
    active_members: number;
    members_with_blockers: number;
    total_team_velocity: number;
  };
}

export const statusReportsApi = {
  /**
   * Get status report for a specific project
   */
  async getProjectReport(projectId: number, period: 'daily' | 'weekly' = 'weekly'): Promise<StatusReport> {
    const response = await fetch(
      `${API_BASE_URL}/status-reports/project/${projectId}?period=${period}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    return handleResponse(response);
  },

  /**
   * Get comparison report across multiple projects
   */
  async getComparisonReport(projectIds: number[], period: 'daily' | 'weekly' = 'weekly'): Promise<ComparisonReport> {
    const queryString = projectIds.map(id => `project_ids=${id}`).join('&');
    const response = await fetch(
      `${API_BASE_URL}/status-reports/compare?${queryString}&period=${period}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    return handleResponse(response);
  },

  /**
   * Get status report for all user's projects
   */
  async getMyProjectsStatus(period: 'daily' | 'weekly' = 'weekly'): Promise<ComparisonReport> {
    const response = await fetch(
      `${API_BASE_URL}/status-reports/my-projects?period=${period}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    return handleResponse(response);
  },

  /**
   * Get comprehensive status report with per-status metrics and transitions
   */
  async getComprehensiveReport(projectId: number, period: 'daily' | 'weekly' = 'weekly'): Promise<ComprehensiveStatusReport> {
    const response = await fetch(
      `${API_BASE_URL}/status-reports/comprehensive/${projectId}?period=${period}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    return handleResponse(response);
  },

  /**
   * Get stand-up focused status report for a specific project
   * Designed for morning stand-ups with yesterday's activity, today's priorities, and blockers
   */
  async getStandupReport(projectId: number, assigneeId?: number): Promise<StandupReport> {
    const url = assigneeId
      ? `${API_BASE_URL}/status-reports/standup/${projectId}?assignee_id=${assigneeId}`
      : `${API_BASE_URL}/status-reports/standup/${projectId}`;

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return handleResponse(response);
  },

  /**
   * Get team-wide stand-up report with per-member breakdowns
   * Perfect for team stand-ups where everyone shares their updates
   */
  async getTeamStandupReport(projectId: number): Promise<TeamStandupReport> {
    const response = await fetch(
      `${API_BASE_URL}/status-reports/standup/team/${projectId}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    return handleResponse(response);
  },
};