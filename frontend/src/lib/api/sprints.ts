/**
 * Sprint API Client
 * Handles all Sprint-related API calls for Agile sprint management
 */

import { apiClient } from './client';
import { SharedResource } from './sharedCache';

// ========== Types ==========

export enum SprintState {
  FUTURE = 'future',
  ACTIVE = 'active',
  CLOSED = 'closed',
}

export interface Sprint {
  id: number;
  project_id: number;
  name: string;
  goal?: string;
  state: SprintState;
  start_date?: string;
  end_date?: string;
  completed_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface SprintCreate {
  name: string;
  goal?: string;
  start_date?: string;
  end_date?: string;
}

export interface SprintUpdate {
  name?: string;
  goal?: string;
  start_date?: string;
  end_date?: string;
}

export interface SprintCapacity {
  sprint_id: number;
  total_story_points: number;
  completed_story_points: number;
  remaining_story_points: number;
  total_issues: number;
  completed_issues: number;
  remaining_issues: number;
  days_remaining?: number;
  progress_percentage: number;
}

export interface SprintIssueAssignment {
  issue_ids: number[];
}

export interface SprintStartDates {
  // Only the end date is sent: activation always stamps the start date as today.
  end_date?: string;
}

// ========== API Client ==========

// Sprints are reference data for every board, backlog and picker in a project.
const sprintsCache = new SharedResource<Sprint[]>('sprints');

export const sprintsAPI = {
  /**
   * Get all sprints for a project
   */
  async getSprints(projectId: number, state?: SprintState): Promise<Sprint[]> {
    // The unfiltered list is the one every screen asks for, so it is shared;
    // a state-filtered list is a narrower question and is read straight through.
    if (!state) {
      return sprintsCache.get(projectId, async () => {
        const response = await apiClient.get<Sprint[]>(`/projects/${projectId}/sprints`);
        return response.data;
      });
    }
    const response = await apiClient.get<Sprint[]>(`/projects/${projectId}/sprints?state=${state}`);
    return response.data;
  },

  /**
   * Get a specific sprint by ID
   */
  async getSprint(projectId: number, sprintId: number): Promise<Sprint> {
    const response = await apiClient.get<Sprint>(`/projects/${projectId}/sprints/${sprintId}`);
    return response.data;
  },

  /**
   * Create a new sprint
   */
  async createSprint(projectId: number, data: SprintCreate): Promise<Sprint> {
    sprintsCache.invalidate(projectId);
    const response = await apiClient.post<SprintCreate, Sprint>(`/projects/${projectId}/sprints`, data);
    return response.data;
  },

  /**
   * Update a sprint
   */
  async updateSprint(projectId: number, sprintId: number, data: SprintUpdate): Promise<Sprint> {
    sprintsCache.invalidate(projectId);
    const response = await apiClient.put<SprintUpdate, Sprint>(`/projects/${projectId}/sprints/${sprintId}`, data);
    return response.data;
  },

  /**
   * Delete a sprint (only if empty)
   */
  async deleteSprint(projectId: number, sprintId: number): Promise<void> {
    sprintsCache.invalidate(projectId);
    await apiClient.delete(`/projects/${projectId}/sprints/${sprintId}`);
  },

  /**
   * Start a sprint (future → active).
   *
   * An end date is mandatory to start a sprint (the backend enforces this). Pass
   * start/end dates here when activating a sprint that has none yet; omit them to
   * use whatever is already stored on the sprint.
   */
  async startSprint(
    projectId: number,
    sprintId: number,
    dates?: SprintStartDates,
  ): Promise<Sprint> {
    sprintsCache.invalidate(projectId);
    const response = await apiClient.post<SprintStartDates | undefined, Sprint>(
      `/projects/${projectId}/sprints/${sprintId}/start`,
      dates,
    );
    return response.data;
  },

  /**
   * Change a sprint's end date (extend or fix it). Admin-only on the backend
   * (global or project admin); the start date is not editable.
   */
  async updateSprintDates(
    projectId: number,
    sprintId: number,
    data: { end_date: string },
  ): Promise<Sprint> {
    sprintsCache.invalidate(projectId);
    const response = await apiClient.patch<{ end_date: string }, Sprint>(
      `/projects/${projectId}/sprints/${sprintId}/dates`,
      data,
    );
    return response.data;
  },

  /**
   * Complete a sprint (active → closed)
   * Incomplete issues are moved back to backlog, or to the sprint
   * specified by moveToSprintId.
   */
  async completeSprint(projectId: number, sprintId: number, moveToSprintId?: number | null): Promise<Sprint> {
    sprintsCache.invalidate(projectId);
    const response = await apiClient.post<{ move_to_sprint_id: number | null }, Sprint>(
      `/projects/${projectId}/sprints/${sprintId}/complete`,
      { move_to_sprint_id: moveToSprintId ?? null }
    );
    return response.data;
  },

  /**
   * Add issues to a sprint
   */
  async addIssuesToSprint(projectId: number, sprintId: number, issueIds: number[]): Promise<{ success: boolean; issues_added: number }> {
    sprintsCache.invalidate(projectId);
    const response = await apiClient.post<SprintIssueAssignment, { success: boolean; issues_added: number }>(`/projects/${projectId}/sprints/${sprintId}/issues`, { issue_ids: issueIds });
    return response.data;
  },

  /**
   * Remove an issue from a sprint
   */
  async removeIssueFromSprint(projectId: number, sprintId: number, issueId: number): Promise<void> {
    sprintsCache.invalidate(projectId);
    await apiClient.delete(`/projects/${projectId}/sprints/${sprintId}/issues/${issueId}`);
  },

  /**
   * Get sprint capacity (story points and issue counts)
   */
  async getSprintCapacity(projectId: number, sprintId: number): Promise<SprintCapacity> {
    const response = await apiClient.get<SprintCapacity>(`/projects/${projectId}/sprints/${sprintId}/capacity`);
    return response.data;
  },
};
