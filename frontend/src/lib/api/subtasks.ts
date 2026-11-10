/**
 * Subtasks API client for issue hierarchy
 */
import type { Priority } from '../priority';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ========== Types ==========

export type SubtaskPriority = Priority;

export interface Subtask {
  id: number;
  parent_id: number;
  project_id: number;
  key: string;
  title: string;
  description?: string;
  status_id: number;
  status_name?: string;
  priority?: SubtaskPriority;
  assignee?: {
    id: number;
    name: string;
    email: string;
    initials: string;
  };
  reporter?: {
    id: number;
    name: string;
    email: string;
    initials: string;
  };
  completed: boolean;
  /** Archived subtasks are returned only when the caller opts in (parent detail view). */
  archived?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface SubtaskCreateData {
  title: string;
  description?: string;
  assignee_email?: string;
  status_id?: number;
  priority?: SubtaskPriority;
  due_date?: string;
}

export interface SubtaskUpdateData {
  title?: string;
  description?: string;
  assignee_email?: string | null;
  status_id?: number;
  priority?: SubtaskPriority;
  completed?: boolean;
}

// ========== Helper Functions ==========

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ========== Subtasks API ==========

export const subtasksAPI = {
  // Get all subtasks for a parent issue
  list: async (
    projectId: number,
    parentIssueId: number,
    includeArchived = false
  ): Promise<Subtask[]> => {
    const query = includeArchived ? '?include_archived=true' : '';
    return fetchAPI<Subtask[]>(
      `/projects/${projectId}/issues/${parentIssueId}/subtasks${query}`
    );
  },

  // Create a new subtask
  create: async (
    projectId: number,
    parentIssueId: number,
    data: SubtaskCreateData
  ): Promise<Subtask> => {
    return fetchAPI<Subtask>(
      `/projects/${projectId}/issues/${parentIssueId}/subtasks`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  },

  // Update a subtask
  update: async (
    projectId: number,
    parentIssueId: number,
    subtaskId: number,
    data: SubtaskUpdateData
  ): Promise<Subtask> => {
    return fetchAPI<Subtask>(
      `/projects/${projectId}/issues/${parentIssueId}/subtasks/${subtaskId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  },

  // Delete a subtask
  delete: async (
    projectId: number,
    parentIssueId: number,
    subtaskId: number
  ): Promise<void> => {
    return fetchAPI<void>(
      `/projects/${projectId}/issues/${parentIssueId}/subtasks/${subtaskId}`,
      {
        method: 'DELETE',
      }
    );
  },

  // Toggle subtask completion (quick helper)
  toggleComplete: async (
    projectId: number,
    parentIssueId: number,
    subtaskId: number,
    completed: boolean
  ): Promise<Subtask> => {
    return fetchAPI<Subtask>(
      `/projects/${projectId}/issues/${parentIssueId}/subtasks/${subtaskId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ completed }),
      }
    );
  },
};
