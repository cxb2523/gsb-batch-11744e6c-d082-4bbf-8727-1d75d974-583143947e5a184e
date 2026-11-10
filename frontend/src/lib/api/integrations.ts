/**
 * Integrations API client — Slack connection + Reports
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function fetchAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlackIntegrationStatus {
  connected: boolean;
  workspace_name?: string;
  channel_id?: string | null;
  channel_name?: string | null;
  connected_at?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
}

export interface ProjectReport {
  project_id: number;
  generated_at: string;
  summary: {
    total_tickets: number;
    open: number;
    closed: number;
    created_this_week: number;
    created_this_month: number;
    closed_this_week: number;
    closed_this_month: number;
    unassigned: number;
    overdue: number;
  };
  assignee_stats: Record<string, { open: number; closed: number; total: number }>;
  status_distribution: Record<string, number>;
  velocity: Array<{ label: string; closed: number }>;
}

// ---------------------------------------------------------------------------
// Generic integrations
// ---------------------------------------------------------------------------

export type Capability =
  | 'connect_oauth' | 'connect_form'
  | 'notify_channel' | 'notify_dm'
  | 'targets' | 'inbound';

export interface ConnectField {
  key: string;
  label: string;
  type: 'text' | 'url' | 'password';
  placeholder?: string;
  required: boolean;
}

export interface ConnectDescriptor {
  mode: 'oauth' | 'form';
  authorize_url?: string | null;
  fields: ConnectField[];
}

export interface ProviderInfo {
  key: string;
  name: string;
  description: string;
  capabilities: Capability[];
  /** False when the server hasn't set up this provider's credentials (or they're
   *  still placeholders). The UI shows "not configured" instead of a connect button. */
  configured: boolean;
  connect: { mode: 'oauth' | 'form'; fields: ConnectField[] };
}

export interface IntegrationTarget {
  id: string;
  name: string;
  is_private: boolean;
}

/** Status shape is provider-specific; these keys are common ones. */
export interface IntegrationStatus {
  connected: boolean;
  connected_at?: string;
  [key: string]: unknown;
}

export const integrationsAPI = {
  /** List all providers and their capabilities (drives the settings UI). */
  listProviders: async (): Promise<{ providers: ProviderInfo[] }> => {
    return fetchAPI<{ providers: ProviderInfo[] }>(`/integrations/providers`);
  },

  /** Status of every provider for a project. */
  getAll: async (projectId: number): Promise<{ integrations: Record<string, IntegrationStatus> }> => {
    return fetchAPI(`/projects/${projectId}/integrations`);
  },

  /** Status of one provider. */
  getStatus: async (projectId: number, provider: string): Promise<IntegrationStatus> => {
    return fetchAPI(`/projects/${projectId}/integrations/${provider}`);
  },

  /** Get the connect descriptor (OAuth URL or form fields) for a provider. */
  getConnect: async (projectId: number, provider: string): Promise<ConnectDescriptor> => {
    return fetchAPI(`/projects/${projectId}/integrations/${provider}/connect`);
  },

  /** Submit config for a form-based (non-OAuth) provider. */
  connectForm: async (projectId: number, provider: string, values: Record<string, string>): Promise<IntegrationStatus> => {
    return fetchAPI(`/projects/${projectId}/integrations/${provider}/connect`, {
      method: 'POST',
      body: JSON.stringify(values),
    });
  },

  /** List selectable delivery targets (e.g. Slack channels). */
  listTargets: async (projectId: number, provider: string): Promise<{ targets: IntegrationTarget[] }> => {
    return fetchAPI(`/projects/${projectId}/integrations/${provider}/targets`);
  },

  /** Set the active delivery target. */
  setTarget: async (projectId: number, provider: string, targetId: string, targetName: string): Promise<void> => {
    await fetchAPI(`/projects/${projectId}/integrations/${provider}/target`, {
      method: 'PUT',
      body: JSON.stringify({ target_id: targetId, target_name: targetName }),
    });
  },

  /** Disconnect a provider. */
  disconnect: async (projectId: number, provider: string): Promise<void> => {
    await fetchAPI(`/projects/${projectId}/integrations/${provider}`, { method: 'DELETE' });
  },
};

// ---------------------------------------------------------------------------
// Slack Integration API (thin wrapper kept for backward compatibility)
// ---------------------------------------------------------------------------

export const slackAPI = {
  /** Get the Slack OAuth authorize URL for a project. */
  getAuthorizeUrl: async (projectId: number): Promise<{ authorize_url: string }> => {
    return fetchAPI<{ authorize_url: string }>(`/projects/${projectId}/integrations/slack/authorize`);
  },

  /** Get current Slack integration status. */
  getIntegration: async (projectId: number): Promise<SlackIntegrationStatus> => {
    return fetchAPI<SlackIntegrationStatus>(`/projects/${projectId}/integrations/slack`);
  },

  /** List available Slack channels in the connected workspace. */
  listChannels: async (projectId: number): Promise<{ channels: SlackChannel[] }> => {
    return fetchAPI<{ channels: SlackChannel[] }>(`/projects/${projectId}/integrations/slack/channels`);
  },

  /** Set the project's linked Slack channel. */
  updateChannel: async (projectId: number, channelId: string, channelName: string): Promise<void> => {
    await fetchAPI(`/projects/${projectId}/integrations/slack/channel`, {
      method: 'PUT',
      body: JSON.stringify({ channel_id: channelId, channel_name: channelName }),
    });
  },

  /** Disconnect Slack from the project. */
  disconnect: async (projectId: number): Promise<void> => {
    await fetchAPI(`/projects/${projectId}/integrations/slack`, { method: 'DELETE' });
  },
};

// ---------------------------------------------------------------------------
// Reports API
// ---------------------------------------------------------------------------

export const reportsAPI = {
  /** Fetch the performance report for a project. */
  getReport: async (projectId: number): Promise<ProjectReport> => {
    return fetchAPI<ProjectReport>(`/projects/${projectId}/reports`);
  },
};
