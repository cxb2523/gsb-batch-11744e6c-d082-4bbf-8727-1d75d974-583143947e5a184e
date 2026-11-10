import { apiClient } from './client';

// ========== Burndown Chart ==========

export interface BurndownDataPoint {
  date: string;
  story_points_remaining: number;
  ideal_remaining: number;
  scope_change?: number;
}

export interface BurndownChartData {
  sprint_id: number;
  sprint_name: string;
  start_date: string;
  end_date: string;
  total_story_points: number;
  data_points: BurndownDataPoint[];
}

// ========== Velocity Chart ==========

export interface VelocityDataPoint {
  sprint_id: number;
  sprint_name: string;
  committed: number;
  completed: number;
}

export interface VelocityChartData {
  sprints: VelocityDataPoint[];
  average_velocity: number;
}

// ========== Sprint Report ==========

export interface SprintReportIssue {
  id: number;
  key: string;
  title: string;
  type: string;
  status_name: string;
  story_points?: number;
  assignee?: any;
}

export interface SprintReportData {
  sprint_id: number;
  sprint_name: string;
  start_date: string;
  end_date: string;
  completed_issues: SprintReportIssue[];
  incomplete_issues: SprintReportIssue[];
  added_issues: SprintReportIssue[];
  removed_issues: SprintReportIssue[];
  total_committed_points: number;
  total_completed_points: number;
  completion_percentage: number;
}

export const reportsAPI = {
  /**
   * Get burndown chart data for a sprint
   */
  async getBurndownChart(projectId: number, sprintId: number): Promise<BurndownChartData> {
    const response = await apiClient.get<BurndownChartData>(
      `/projects/${projectId}/reports/burndown?sprint_id=${sprintId}`
    );
    return response.data;
  },

  /**
   * Get velocity chart data
   */
  async getVelocityChart(projectId: number, numSprints: number = 6): Promise<VelocityChartData> {
    const response = await apiClient.get<VelocityChartData>(
      `/projects/${projectId}/reports/velocity?num_sprints=${numSprints}`
    );
    return response.data;
  },

  /**
   * Get sprint report data
   */
  async getSprintReport(projectId: number, sprintId: number): Promise<SprintReportData> {
    const response = await apiClient.get<SprintReportData>(
      `/projects/${projectId}/reports/sprint-report?sprint_id=${sprintId}`
    );
    return response.data;
  },
};
