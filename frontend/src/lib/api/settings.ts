/**
 * Settings API client for backend integration
 */

import { SharedResource } from './sharedCache';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ========== Types ==========

export interface ProjectSettings {
  project_id: number;
  name: string;
  key: string;
  description: string;
  visibility: 'public' | 'private';
  status: 'active' | 'archived';
  owner: {
    id: number;
    name: string;
    email: string;
  };
  created_at: string;
  updated_at?: string;
}

export interface WorkflowStatus {
  id: number;
  project_id: number;
  name: string;
  color: string;
  position: number;
}

export interface Label {
  id: number;
  project_id: number;
  name: string;
  color: string;
  description?: string;
  created_at: string;
}

export interface ProjectMember {
  user_id: number;
  email: string;
  name: string;
  role: 'admin' | 'member' | 'viewer';
  joined_at: string;
  active?: boolean;
  assigned_issues?: number;
  last_active?: string | null;
  initials?: string | null;
  is_global_admin?: boolean;
  implicit?: boolean;
}

export interface NotificationPreferences {
  user_id: number;
  issue_assignments: boolean;
  mentions: boolean;
  status_changes: boolean;
  comments: boolean;
  email_notifications: boolean;
  updated_at: string;
}

export interface Notification {
  id: number;
  user_id: number;
  type: string;
  message: string;
  read: boolean;
  project_id?: number;
  ticket_id?: number;
  ticket_key?: string;
  created_at: string;
}

// ========== Helper Functions ==========

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Include cookies for authentication
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

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

// ========== General Settings API ==========

export const settingsAPI = {
  // Get project settings
  getProjectSettings: async (projectId: number): Promise<ProjectSettings> => {
    return fetchAPI<ProjectSettings>(`/projects/${projectId}/settings`);
  },

  // Update project settings
  updateProjectSettings: async (
    projectId: number,
    data: Partial<Pick<ProjectSettings, 'name' | 'description' | 'visibility' | 'status'>> & {
      project_deadline?: string;
    }
  ): Promise<ProjectSettings> => {
    return fetchAPI<ProjectSettings>(`/projects/${projectId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Archive project
  archiveProject: async (projectId: number): Promise<void> => {
    return fetchAPI<void>(`/projects/${projectId}/archive`, {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
  },
};

// ========== Workflow Status API ==========

// Project reference data: the same for every screen in a project, and read by
// most of them. Cached so the second reader gets the first reader's answer;
// every write below drops the entry it affects.
const statusesCache = new SharedResource<WorkflowStatus[]>('statuses');
const labelsCache = new SharedResource<Label[]>('labels');
const membersCache = new SharedResource<ProjectMember[]>('members');

export const workflowAPI = {
  // Get all workflow statuses
  getStatuses: async (projectId: number): Promise<WorkflowStatus[]> => {
    return statusesCache.get(projectId, () =>
      fetchAPI<WorkflowStatus[]>(`/projects/${projectId}/statuses`)
    );
  },

  // Create workflow status
  createStatus: async (
    projectId: number,
    data: { name: string; color?: string; position?: number }
  ): Promise<WorkflowStatus> => {
    statusesCache.invalidate(projectId);
    return fetchAPI<WorkflowStatus>(`/projects/${projectId}/statuses`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update workflow status
  updateStatus: async (
    projectId: number,
    statusId: number,
    data: { name?: string; color?: string; position?: number }
  ): Promise<WorkflowStatus> => {
    statusesCache.invalidate(projectId);
    return fetchAPI<WorkflowStatus>(
      `/projects/${projectId}/statuses/${statusId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  },

  // Delete workflow status
  deleteStatus: async (projectId: number, statusId: number): Promise<void> => {
    statusesCache.invalidate(projectId);
    return fetchAPI<void>(`/projects/${projectId}/statuses/${statusId}`, {
      method: 'DELETE',
    });
  },

  // Reorder workflow statuses
  reorderStatuses: async (
    projectId: number,
    statusIds: number[]
  ): Promise<WorkflowStatus[]> => {
    statusesCache.invalidate(projectId);
    return fetchAPI<WorkflowStatus[]>(
      `/projects/${projectId}/statuses/reorder`,
      {
        method: 'POST',
        body: JSON.stringify({ status_ids: statusIds }),
      }
    );
  },
};

// ========== Labels API ==========

export const labelsAPI = {
  // Get all labels
  getLabels: async (projectId: number): Promise<Label[]> => {
    return labelsCache.get(projectId, () => fetchAPI<Label[]>(`/projects/${projectId}/labels`));
  },

  // Create label
  createLabel: async (
    projectId: number,
    data: { name: string; color?: string; description?: string }
  ): Promise<Label> => {
    labelsCache.invalidate(projectId);
    return fetchAPI<Label>(`/projects/${projectId}/labels`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update label
  updateLabel: async (
    projectId: number,
    labelId: number,
    data: { name?: string; color?: string; description?: string }
  ): Promise<Label> => {
    labelsCache.invalidate(projectId);
    return fetchAPI<Label>(`/projects/${projectId}/labels/${labelId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete label
  deleteLabel: async (projectId: number, labelId: number): Promise<void> => {
    labelsCache.invalidate(projectId);
    return fetchAPI<void>(`/projects/${projectId}/labels/${labelId}`, {
      method: 'DELETE',
    });
  },
};

// ========== Project Members API ==========

export interface AvailableUser {
  user_id: number;
  name: string;
  email: string;
  designation: string;
}

export const membersAPI = {
  // Get active users not already in this project
  getAvailableUsers: async (projectId: number): Promise<AvailableUser[]> => {
    return fetchAPI<AvailableUser[]>(`/projects/${projectId}/members/available`);
  },

  // Get users that can be added to a project (active, excluding global admins).
  // Pass a projectId to also exclude users already on that project; omit it when
  // creating a project (no project exists yet).
  getAssignableUsers: async (projectId?: number): Promise<AvailableUser[]> => {
    const qs = projectId != null ? `?project_id=${projectId}` : '';
    return fetchAPI<AvailableUser[]>(`/projects/assignable-users${qs}`);
  },

  // Add several members at once, each with a project role.
  addMembersBulk: async (
    projectId: number,
    members: { user_id: number; role: 'admin' | 'member' | 'viewer' }[]
  ): Promise<ProjectMember[]> => {
    membersCache.invalidate(projectId);
    return fetchAPI<ProjectMember[]>(`/projects/${projectId}/members/bulk`, {
      method: 'POST',
      body: JSON.stringify({ members }),
    });
  },

  // Get all project members
  getMembers: async (projectId: number): Promise<ProjectMember[]> => {
    return membersCache.get(projectId, () => membersAPI.fetchMembers(projectId));
  },

  /** The uncached read behind getMembers. */
  fetchMembers: async (projectId: number): Promise<ProjectMember[]> => {
    return fetchAPI<ProjectMember[]>(`/projects/${projectId}/members`);
  },

  // Add project member
  addMember: async (
    projectId: number,
    data: { user_id: number; role: 'admin' | 'member' | 'viewer' }
  ): Promise<ProjectMember> => {
    membersCache.invalidate(projectId);
    return fetchAPI<ProjectMember>(`/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Invite member by email (will be inactive until they sign in)
  inviteMember: async (
    projectId: number,
    data: { email: string; role: 'admin' | 'member' | 'viewer' }
  ): Promise<ProjectMember> => {
    membersCache.invalidate(projectId);
    return fetchAPI<ProjectMember>(`/projects/${projectId}/members/invite`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update member role
  updateMember: async (
    projectId: number,
    userId: number,
    data: { role: 'admin' | 'member' | 'viewer' }
  ): Promise<ProjectMember> => {
    membersCache.invalidate(projectId);
    return fetchAPI<ProjectMember>(
      `/projects/${projectId}/members/${userId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  },

  // Remove member
  removeMember: async (projectId: number, userId: number): Promise<void> => {
    membersCache.invalidate(projectId);
    return fetchAPI<void>(`/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
    });
  },

  // Remove pending member by email
  removePendingMember: async (projectId: number, email: string): Promise<void> => {
    membersCache.invalidate(projectId);
    return fetchAPI<void>(`/projects/${projectId}/members/by-email/${encodeURIComponent(email)}`, {
      method: 'DELETE',
    });
  },
};

// ========== Notifications API ==========

export const notificationsAPI = {
  // Get notification preferences
  getPreferences: async (): Promise<NotificationPreferences> => {
    return fetchAPI<NotificationPreferences>('/projects/notifications/preferences');
  },

  // Update notification preferences
  updatePreferences: async (
    data: Partial<Omit<NotificationPreferences, 'user_id' | 'updated_at'>>
  ): Promise<NotificationPreferences> => {
    return fetchAPI<NotificationPreferences>('/projects/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Get notifications for current user (optionally filter by project)
  getNotifications: async (projectId?: number): Promise<Notification[]> => {
    const params = projectId ? `?project_id=${projectId}` : '';
    return fetchAPI<Notification[]>(`/projects/notifications${params}`);
  },

  // Mark a notification as read
  markAsRead: async (notificationId: number): Promise<Notification> => {
    return fetchAPI<Notification>(`/projects/notifications/${notificationId}/read`, {
      method: 'POST',
    });
  },

  // Mark every unread notification as read (items stay in the list)
  markAllAsRead: async (): Promise<{ updated: number }> => {
    return fetchAPI<{ updated: number }>('/projects/notifications/read-all', {
      method: 'POST',
    });
  },

  // Permanently delete a single notification
  deleteNotification: async (notificationId: number): Promise<void> => {
    return fetchAPI<void>(`/projects/notifications/${notificationId}`, {
      method: 'DELETE',
    });
  },

  // Permanently delete all of the current user's notifications
  clearAll: async (): Promise<{ deleted: number }> => {
    return fetchAPI<{ deleted: number }>('/projects/notifications', {
      method: 'DELETE',
    });
  },
};
