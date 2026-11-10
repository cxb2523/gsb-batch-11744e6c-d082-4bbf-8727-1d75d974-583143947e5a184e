/**
 * Tickets API client for backend integration
 */
import type { Priority } from '../priority';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ========== Types ==========

export interface Ticket {
  id: number;
  project_id: number;
  key: string;
  title: string;
  description?: string;
  type: 'task' | 'bug' | 'campaign' | 'design' | 'engineering' | 'story' | 'subtask' | 'epic';
  status_id: number;
  status_name?: string;
  // Configured hex colour of the status + its derived category. Paint status chips from
  // these (see lib/statusVisual) so every surface matches the board.
  status_color?: string | null;
  status_category?: 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done' | null;
  // Status held before the ticket was moved to "Blocked"; used by the transition cap
  // to resume the one-step-forward rule from where the ticket left off.
  pre_block_status_id?: number | null;
  // Canonical scale: Urgent, High, Medium, Low (legacy P0/P1/P2 normalized on write).
  priority?: Priority;
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
  epic_id?: number;
  epic_name?: string;
  sprint_id?: number;
  sprint_name?: string;
  story_points?: number;
  due_date?: string;
  labels?: string[];
  created_at: string;
  updated_at?: string;
  // Time tracking fields
  original_estimate_seconds?: number;
  time_spent_seconds?: number;
  remaining_estimate_seconds?: number;
  // Parent-child relationship fields
  parent_id?: number;
  parent_key?: string;
  parent_title?: string;
  parent_type?: string;
  /** Rollup of this issue's subtasks. Subtasks are not returned as issues of their own. */
  subtasks_count?: number | null;
  subtasks_completed?: number | null;
  // Development fields
  merge_request_url?: string;
  // Archival: archived tickets are hidden from the board/backlog/sprint/search
  archived?: boolean;
  archived_at?: string;
  // Watchers (populated separately)
  watchers?: Array<{
    user_id: number;
    name: string;
    email: string;
    initials: string;
  }>;
}

export interface TicketCreateData {
  title: string;
  description?: string;
  type: 'story' | 'task' | 'bug' | 'epic' | 'subtask' | 'campaign' | 'design' | 'engineering';
  status_id: number;
  priority?: Priority;
  assignee_email?: string;
  epic_id?: number;
  parent_id?: number; // For subtasks, link to parent issue
  sprint_id?: number;
  story_points?: number;
  due_date?: string;
  start_date?: string; // Planned start date
  labels?: string[];
  original_estimate_seconds?: number; // Time tracking
  merge_request_url?: string; // Development
}

export interface TicketBulkUpdateFields {
  status_id?: number | null;
  assignee_email?: string | null;
  priority?: Priority | null;
  labels_add?: string[] | null;
  labels_remove?: string[] | null;
  sprint_id?: number | null;
  epic_id?: number | null;
  archived?: boolean | null;
}

export interface TicketBulkUpdateRequest {
  ticket_numbers: number[];
  updates: TicketBulkUpdateFields;
}

export interface TicketBulkUpdateResult {
  updated: number;
  errors: Array<{ ticket_number: number; error: string }>;
}

export interface TicketBulkDeleteResult {
  deleted: number;
  subtasks_deleted: number;
  errors: Array<{ ticket_number: number; error: string }>;
}

export interface TicketDeleteImpact {
  ticket_key: string;
  subtasks: number;
  comments: number;
  attachments: number;
  worklogs: number;
  time_spent_seconds: number;
}

export interface TicketUpdateData {
  title?: string;
  description?: string;
  type?: 'story' | 'task' | 'bug' | 'epic' | 'subtask' | 'campaign' | 'design' | 'engineering';
  status_id?: number;
  priority?: Priority;
  assignee_email?: string | null;
  epic_id?: number | null;
  parent_id?: number | null; // For subtasks
  sprint_id?: number | null;
  story_points?: number | null;
  due_date?: string;
  start_date?: string;
  labels?: string[];
  original_estimate_seconds?: number | null;
  remaining_estimate_seconds?: number | null;
  merge_request_url?: string; // Development
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

// ========== Tickets API ==========

/** One page of results, as the list endpoints return it when given a `limit`. */
export interface Page<T> {
  items: T[];
  /** Pass back as `cursor` for the next page; null on the last one. */
  next_cursor: string | null;
  /** Rows matching the filters, not the page. */
  total: number;
}

export interface TicketFilters {
  status_id?: number;
  assignee_email?: string;
  /** The assignee by id; the server resolves it to an address. */
  assignee_id?: number;
  include_archived?: boolean;
  archived_only?: boolean;
  /** Subtasks are excluded by default; they are shown inside their parent. */
  include_subtasks?: boolean;
  /** Only tickets under this epic. */
  epic_id?: number;
  /** Only tickets belonging to no epic at all. */
  no_epic?: boolean;
  /** Only tickets in this sprint. */
  sprint_id?: number;
  /** Only tickets in no sprint at all - the backlog. */
  no_sprint?: boolean;
  /** Only subtasks of this ticket. */
  parent_id?: number;
  type?: string;
  /** Any of these types. Used by the pickers, which want everything but epics. */
  types?: string[];
  priority?: string;
  /** Only tickets carrying this label. */
  label?: string;
  /** Matches key, title or assignee name, case-insensitively. */
  q?: string;
}

function ticketFilterParams(filters?: TicketFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (!filters) return params;

  const numbers = ['status_id', 'assignee_id', 'epic_id', 'sprint_id', 'parent_id'] as const;
  for (const key of numbers) {
    const value = filters[key];
    if (value !== undefined) params.append(key, value.toString());
  }

  const strings = ['assignee_email', 'type', 'priority', 'label', 'q'] as const;
  for (const key of strings) {
    const value = filters[key];
    // An empty search is no search: sending q= would be a filter matching nothing.
    if (value !== undefined && value !== '') params.append(key, value);
  }

  for (const value of filters.types ?? []) {
    params.append('types', value);
  }

  const flags = ['include_archived', 'archived_only', 'include_subtasks', 'no_epic', 'no_sprint'] as const;
  for (const key of flags) {
    if (filters[key]) params.append(key, 'true');
  }

  return params;
}

export const ticketsAPI = {
  // Get all tickets for a project
  getTickets: async (projectId: number, filters?: TicketFilters): Promise<Ticket[]> => {
    const query = ticketFilterParams(filters).toString();
    return fetchAPI<Ticket[]>(`/projects/${projectId}/tickets${query ? `?${query}` : ''}`);
  },

  /**
   * One page of tickets, newest first. Takes the same filters plus a page size
   * and the cursor a previous page returned; `cursor` omitted means the first
   * page. Callers that want the whole list keep using getTickets, which still
   * returns a plain array.
   */
  getTicketsPage: async (
    projectId: number,
    options: TicketFilters & { limit: number; cursor?: string | null }
  ): Promise<Page<Ticket>> => {
    const params = ticketFilterParams(options);
    params.append('limit', options.limit.toString());
    if (options.cursor) {
      params.append('cursor', options.cursor);
    }
    return fetchAPI<Page<Ticket>>(`/projects/${projectId}/tickets?${params.toString()}`);
  },

  // Get a single ticket
  getTicket: async (projectId: number, ticketId: number): Promise<Ticket> => {
    return fetchAPI<Ticket>(`/projects/${projectId}/tickets/${ticketId}`);
  },

  // Create a new ticket
  createTicket: async (
    projectId: number,
    data: TicketCreateData
  ): Promise<Ticket> => {
    return fetchAPI<Ticket>(`/projects/${projectId}/tickets`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update a ticket
  updateTicket: async (
    projectId: number,
    ticketId: number,
    data: TicketUpdateData
  ): Promise<Ticket> => {
    return fetchAPI<Ticket>(`/projects/${projectId}/tickets/${ticketId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /** Turn a subtask into a standalone issue: detaches the parent and sets a real type. */
  promoteToIssue: async (
    projectId: number,
    ticketId: number,
    type: 'story' | 'task' | 'bug' = 'task'
  ): Promise<Ticket> => {
    return fetchAPI<Ticket>(`/projects/${projectId}/tickets/${ticketId}/promote`, {
      method: 'POST',
      body: JSON.stringify({ type }),
    });
  },

  // Delete a ticket (cascades to its subtasks, comments, files, worklogs, links)
  deleteTicket: async (projectId: number, ticketId: number): Promise<void> => {
    return fetchAPI<void>(`/projects/${projectId}/tickets/${ticketId}`, {
      method: 'DELETE',
    });
  },

  // What a delete would destroy - call this before showing a confirm dialog
  getDeleteImpact: async (
    projectId: number,
    ticketId: number
  ): Promise<TicketDeleteImpact> => {
    return fetchAPI<TicketDeleteImpact>(
      `/projects/${projectId}/tickets/${ticketId}/delete_impact`
    );
  },

  // Archive a ticket: hides it from the board/backlog/sprint/search. Reversible.
  archiveTicket: async (projectId: number, ticketId: number): Promise<Ticket> => {
    return fetchAPI<Ticket>(`/projects/${projectId}/tickets/${ticketId}/archive`, {
      method: 'POST',
    });
  },

  // Restore an archived ticket
  unarchiveTicket: async (projectId: number, ticketId: number): Promise<Ticket> => {
    return fetchAPI<Ticket>(`/projects/${projectId}/tickets/${ticketId}/unarchive`, {
      method: 'POST',
    });
  },

  // Delete a batch of tickets
  bulkDelete: async (
    projectId: number,
    ticketNumbers: number[]
  ): Promise<TicketBulkDeleteResult> => {
    return fetchAPI<TicketBulkDeleteResult>(
      `/projects/${projectId}/tickets/bulk_delete`,
      {
        method: 'POST',
        body: JSON.stringify({ ticket_numbers: ticketNumbers }),
      }
    );
  },

  // Apply the same updates to a batch of tickets
  bulkUpdate: async (
    projectId: number,
    payload: TicketBulkUpdateRequest
  ): Promise<TicketBulkUpdateResult> => {
    return fetchAPI<TicketBulkUpdateResult>(
      `/projects/${projectId}/tickets/bulk_update`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  // Move a ticket to a different status (for drag-and-drop)
  moveTicket: async (
    projectId: number,
    ticketId: number,
    statusId: number,
    position?: number
  ): Promise<Ticket> => {
    return fetchAPI<Ticket>(
      `/projects/${projectId}/tickets/${ticketId}/move`,
      {
        method: 'POST',
        body: JSON.stringify({ status_id: statusId, position }),
      }
    );
  },

  // Upload files to a ticket
  uploadFiles: async (
    projectId: number,
    ticketId: number,
    formData: FormData
  ): Promise<{ files: TicketFile[] }> => {
    const url = `${API_BASE_URL}/projects/${projectId}/tickets/${ticketId}/files`;
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  },

  // Get comments for a ticket
  getComments: async (projectId: number, ticketId: number): Promise<TicketComment[]> => {
    return fetchAPI<TicketComment[]>(`/projects/${projectId}/tickets/${ticketId}/comments`);
  },

  // Add a comment to a ticket
  addComment: async (
    projectId: number,
    ticketId: number,
    content: string
  ): Promise<TicketComment> => {
    return fetchAPI<TicketComment>(
      `/projects/${projectId}/tickets/${ticketId}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ content }),
      }
    );
  },

  // Update a comment
  updateComment: async (
    projectId: number,
    ticketId: number,
    commentId: number,
    content: string
  ): Promise<TicketComment> => {
    return fetchAPI<TicketComment>(
      `/projects/${projectId}/tickets/${ticketId}/comments/${commentId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }
    );
  },

  // Delete a comment
  deleteComment: async (
    projectId: number,
    ticketId: number,
    commentId: number
  ): Promise<void> => {
    return fetchAPI<void>(
      `/projects/${projectId}/tickets/${ticketId}/comments/${commentId}`,
      {
        method: 'DELETE',
      }
    );
  },

  // Get files for a ticket
  getFiles: async (projectId: number, ticketId: number): Promise<TicketFile[]> => {
    return fetchAPI<TicketFile[]>(`/projects/${projectId}/tickets/${ticketId}/files`);
  },

  // Upload files to a ticket
  uploadFile: async (
    projectId: number,
    ticketId: number,
    files: FileList | File[]
  ): Promise<{ files: TicketFile[] }> => {
    const formData = new FormData();

    // Handle both FileList and File[] array
    if (Array.isArray(files)) {
      files.forEach(file => {
        formData.append('files', file);
      });
    } else {
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
    }

    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/projects/${projectId}/tickets/${ticketId}/files`;

    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  },

  // Delete a file from a ticket
  deleteFile: async (
    projectId: number,
    ticketId: number,
    fileId: number
  ): Promise<void> => {
    return fetchAPI<void>(
      `/projects/${projectId}/tickets/${ticketId}/files/${fileId}`,
      {
        method: 'DELETE',
      }
    );
  },

  // Get ticket history
  getHistory: async (projectId: number, ticketId: number): Promise<TicketHistory[]> => {
    return fetchAPI<TicketHistory[]>(`/projects/${projectId}/tickets/${ticketId}/history`);
  },
};

// ========== Additional Types ==========

export interface TicketFile {
  id: number;
  ticket_id: number;
  filename: string;
  file_path: string;
  file_type: string;
  file_size: number;
  uploader_email?: string;
  created_at: string;
}

export interface TicketComment {
  id: number;
  ticket_id: number;
  content: string;
  author: {
    id: number;
    name: string;
    email: string;
    initials: string;
  };
  created_at: string;
  updated_at?: string;
}

export interface TicketHistory {
  id: number;
  ticket_id: number;
  field: string;
  old_value?: string;
  new_value?: string;
  changed_by: {
    id: number;
    name: string;
    email: string;
    initials: string;
  };
  created_at: string;
}
