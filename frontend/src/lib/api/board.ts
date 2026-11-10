import { apiGet } from './client';
import type { Ticket } from './tickets';

/**
 * The board, as columns rather than a list.
 *
 * The board asks for the first page of every column in one request, and
 * continues a single column through the ticket list endpoint with the cursor
 * that column handed back. Filtering and grouping happen on the server, so a
 * search finds matches in columns that aren't on screen.
 */

export interface BoardColumnData {
  /** A status id, user number, epic id or priority as a string, or the
   *  catch-all for cards whose grouping field is empty. */
  key: string;
  items: Ticket[];
  /** Every card in this column matching the filters, not just the ones here. */
  total: number;
  /** Present when the column holds more than was returned. */
  next_cursor: string | null;
}

export interface BoardData {
  group_by: BoardGroupBy;
  /** Only columns that hold something; the board knows which columns exist. */
  columns: BoardColumnData[];
}

export type BoardGroupBy = 'status' | 'assignee' | 'epic' | 'priority';

export interface BoardQuery {
  group_by?: BoardGroupBy;
  /** Cards per column on the first load. */
  column_limit?: number;
  assignee_email?: string;
  /** The person, by id. Resolved server-side, so no member list is needed. */
  assignee_id?: number;
  epic_id?: number;
  sprint_id?: number;
  type?: string;
  priority?: string;
  label?: string;
  q?: string;
  include_archived?: boolean;
}

export const boardAPI = {
  async getBoard(projectId: number, query: BoardQuery = {}): Promise<BoardData> {
    const params = new URLSearchParams();

    if (query.group_by) params.append('group_by', query.group_by);
    if (query.column_limit) params.append('column_limit', query.column_limit.toString());
    if (query.assignee_email) params.append('assignee_email', query.assignee_email);
    if (query.assignee_id !== undefined) params.append('assignee_id', query.assignee_id.toString());
    if (query.epic_id !== undefined) params.append('epic_id', query.epic_id.toString());
    if (query.sprint_id !== undefined) params.append('sprint_id', query.sprint_id.toString());
    if (query.type) params.append('type', query.type);
    if (query.priority) params.append('priority', query.priority);
    if (query.label) params.append('label', query.label);
    if (query.q) params.append('q', query.q);
    if (query.include_archived) params.append('include_archived', 'true');

    const suffix = params.toString();
    return apiGet<BoardData>(`/projects/${projectId}/board${suffix ? `?${suffix}` : ''}`);
  },
};
