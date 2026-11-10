import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { Page } from './tickets';
import { SharedResource } from './sharedCache';

interface UserInfo {
  id: number;
  name: string;
  email: string;
  initials: string;
}

export interface Epic {
  id: number;
  project_id: number;
  key: string;
  title: string;
  description?: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  assignee_id?: number;
  assignee?: UserInfo;
  due_date?: string;
  start_date?: string;
  color: string;
  position: number;
  created_at: string;
  updated_at?: string;
  created_by: number;
}

export interface EpicWithStats extends Epic {
  total_tickets: number;
  completed_tickets: number;
  in_progress_tickets: number;
  todo_tickets: number;
  progress_percentage: number;
}

export interface EpicListItem {
  id: number;
  key: string;
  title: string;
  status: string;
  color: string;
  assignee_id?: number;
  assignee?: UserInfo;
  due_date?: string;
  total_tickets: number;
  completed_tickets: number;
  progress_percentage: number;
}

export interface CreateEpicRequest {
  title: string;
  description?: string;
  assignee_id?: number;
  due_date?: string;
  start_date?: string;
  color?: string;
  status?: string;
}

export interface UpdateEpicRequest {
  title?: string;
  description?: string;
  assignee_id?: number;
  due_date?: string;
  start_date?: string;
  color?: string;
  status?: string;
  position?: number;
}

// Epics are project reference data for every screen that offers an epic picker
// or an epic column, so the list is shared the same way statuses and members are.
const epicsCache = new SharedResource<EpicListItem[]>('epics');

export const epicsApi = {
  /**
   * List all epics for a project
   */
  async listEpics(
    projectId: number,
    filters?: {
      status?: string;
      assignee_id?: number;
      /** Matches the epic's key or title, case-insensitively. */
      q?: string;
    }
  ): Promise<EpicListItem[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.assignee_id) params.append('assignee_id', filters.assignee_id.toString());

    if (filters?.q) params.append('q', filters.q);

    const query = params.toString() ? `?${params.toString()}` : '';
    // Only the plain, unfiltered list is shared - that is the one every screen
    // asks for. A filtered or searched list is a question about right now.
    if (!query) {
      return epicsCache.get(projectId, () => apiGet<EpicListItem[]>(`/projects/${projectId}/epics`));
    }
    return apiGet<EpicListItem[]>(`/projects/${projectId}/epics${query}`);
  },

  /**
   * One page of epics, in board order. `cursor` omitted means the first page.
   */
  async listEpicsPage(
    projectId: number,
    options: { limit: number; cursor?: string | null; status?: string; assignee_id?: number; q?: string }
  ): Promise<Page<EpicListItem>> {
    const params = new URLSearchParams();
    params.append('limit', options.limit.toString());
    if (options.cursor) params.append('cursor', options.cursor);
    if (options.status) params.append('status', options.status);
    if (options.assignee_id) params.append('assignee_id', options.assignee_id.toString());
    if (options.q) params.append('q', options.q);

    return apiGet<Page<EpicListItem>>(`/projects/${projectId}/epics?${params.toString()}`);
  },

  /**
   * Get epic details with statistics
   */
  async getEpic(projectId: number, epicId: number): Promise<EpicWithStats> {
    return apiGet<EpicWithStats>(`/projects/${projectId}/epics/${epicId}`);
  },

  /**
   * Create a new epic
   */
  async createEpic(projectId: number, data: CreateEpicRequest): Promise<Epic> {
    epicsCache.invalidate(projectId);
    return apiPost<CreateEpicRequest, Epic>(`/projects/${projectId}/epics`, data);
  },

  /**
   * Update an epic
   */
  async updateEpic(
    projectId: number,
    epicId: number,
    data: UpdateEpicRequest
  ): Promise<Epic> {
    epicsCache.invalidate(projectId);
    return apiPut<UpdateEpicRequest, Epic>(`/projects/${projectId}/epics/${epicId}`, data);
  },

  /**
   * Delete an epic (unlinks tickets, doesn't delete them)
   */
  async deleteEpic(projectId: number, epicId: number): Promise<void> {
    epicsCache.invalidate(projectId);
    return apiDelete(`/projects/${projectId}/epics/${epicId}`);
  },

  /**
   * Reorder epics
   */
  async reorderEpics(projectId: number, epicIds: number[]): Promise<void> {
    epicsCache.invalidate(projectId);
    return apiPost<number[], void>(`/projects/${projectId}/epics/reorder`, epicIds);
  },
};
