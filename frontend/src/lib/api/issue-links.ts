/**
 * Issue Links API client for issue relationships
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ========== Types ==========

export type LinkType =
  | 'blocks'
  | 'is_blocked_by'
  | 'relates_to'
  | 'duplicates'
  | 'is_duplicated_by';

export interface IssueLink {
  id: number;
  issue_id: number;
  issue_key: string;
  issue_title: string;
  issue_type: string;
  issue_status: number;
  created_at: string;
  created_by: {
    id: number;
    name: string;
    email: string;
    initials: string;
  };
}

export interface IssueLinkGrouped {
  blocks: IssueLink[];
  blocked_by: IssueLink[];
  relates_to: IssueLink[];
  duplicates: IssueLink[];
  duplicated_by: IssueLink[];
}

export interface IssueLinkCreateData {
  target_issue_id: number;
  link_type: LinkType;
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

// ========== Issue Links API ==========

export const issueLinksAPI = {
  // Get all links for an issue (grouped by type)
  list: async (
    projectId: number,
    issueId: number
  ): Promise<IssueLinkGrouped> => {
    return fetchAPI<IssueLinkGrouped>(
      `/projects/${projectId}/issues/${issueId}/links`
    );
  },

  // Create a new issue link
  create: async (
    projectId: number,
    issueId: number,
    data: IssueLinkCreateData
  ): Promise<IssueLink> => {
    return fetchAPI<IssueLink>(
      `/projects/${projectId}/issues/${issueId}/links`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  },

  // Delete an issue link
  delete: async (
    projectId: number,
    linkId: number
  ): Promise<void> => {
    return fetchAPI<void>(
      `/projects/${projectId}/links/${linkId}`,
      {
        method: 'DELETE',
      }
    );
  },
};

// Helper to get display name for link type
export function getLinkTypeDisplay(linkType: string): string {
  const displayNames: Record<string, string> = {
    blocks: 'Blocks',
    is_blocked_by: 'Blocked by',
    relates_to: 'Relates to',
    duplicates: 'Duplicates',
    is_duplicated_by: 'Duplicated by',
  };
  return displayNames[linkType] || linkType;
}
