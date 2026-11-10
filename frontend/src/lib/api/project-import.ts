import { apiPost, API_BASE_URL } from './client';

/** One proposed ticket from a spreadsheet, before anything is created. */
export interface SpreadsheetRow {
  ref: number;
  parent_ref: number | null;
  title: string | null;
  description: string | null;
  type: string | null;
  status_id: number | null;
  /** The mapped workflow-status name (resolved to an id at commit). */
  status_name: string | null;
  priority: string | null;
  assignee_email: string | null;
  due_date: string | null;
  labels: string[];
  story_points: number | null;
  missing_required: string[];
  warnings: string[];
}

export interface ColumnMapping {
  header: string;
  /** The ticket field this column mapped to, or null if ignored. */
  field: string | null;
}

export interface AssigneeResolution {
  source: string;
  matched_email: string | null;
  matched_user_id: number | null;
  status: 'matched' | 'ambiguous' | 'unmatched';
}

export interface SpreadsheetParseResponse {
  rows: SpreadsheetRow[];
  options: {
    statuses: { name: string; color?: string }[];
    members: { email: string; name: string }[];
    types: string[];
    priorities: string[];
    default_status_id: number | null;
  };
  columns: ColumnMapping[];
  assignees: AssigneeResolution[];
  member_user_ids: number[];
  source_filename: string;
  row_count: number;
  warnings: string[];
}

export interface ProjectImportCommitRequest {
  project_name: string;
  project_key: string;
  description?: string | null;
  visibility?: string;
  deadline?: string | null;
  rows: SpreadsheetRow[];
  member_user_ids: number[];
}

export interface ProjectImportCommitResponse {
  project_id: number;
  project_key: string;
  created_count: number;
  failed_count: number;
  results: {
    ref: number;
    created: boolean;
    ticket_id: number | null;
    key: string | null;
    title: string | null;
    error: string | null;
  }[];
}

/** Extensions the structured importer accepts. */
export const ACCEPTED_SPREADSHEET_EXTENSIONS = '.xlsx,.xlsm,.csv,.tsv';

export const projectImportAPI = {
  /** Read a spreadsheet and return draft tickets + a column/assignee preview. */
  parse: async (file: File): Promise<SpreadsheetParseResponse> => {
    const form = new FormData();
    form.append('file', file);
    return apiPost<FormData, SpreadsheetParseResponse>('/api/projects/import/parse', form);
  },

  /** Create the project, its members, and the reviewed tickets. */
  commit: async (payload: ProjectImportCommitRequest): Promise<ProjectImportCommitResponse> => {
    return apiPost<ProjectImportCommitRequest, ProjectImportCommitResponse>(
      '/api/projects/import/commit',
      payload
    );
  },

  /** Download the .xlsx template (sends the session cookie, then saves the blob). */
  downloadTemplate: async (): Promise<void> => {
    const res = await fetch(`${API_BASE_URL}/api/projects/import/template`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Could not download the template.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'project-import-template.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
