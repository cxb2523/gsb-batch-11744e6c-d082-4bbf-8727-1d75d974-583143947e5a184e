import { API_BASE_URL, apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

/* ---------- types (mirror backend/app/schemas/standup.py) ---------- */

export type StatusCategory = 'done' | 'blocked' | 'in_review' | 'in_progress' | 'todo';
export type PersonHealth = 'blocked' | 'no_update' | 'ok';
export type TaskSection = 'yesterday' | 'today';
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type AddedSection = 'yesterday' | 'blockers';
export type PickerSection = 'yesterday' | 'today' | 'blockers';

export interface StandupStatus {
  id: number;
  name: string;
  color: string | null;
  category: StatusCategory;
}

export interface StandupTicketRow {
  id: number;
  project_id: number;
  key: string;
  title: string;
  type: string | null;
  priority: string | null;
  status: StandupStatus | null;
  parent: { id: number; key: string; title: string } | null;
  due_date: string | null;
  is_overdue: boolean;
  archived: boolean;
  /** Email of whoever put this ticket on the board. */
  added_by: string | null;
  /** Already added to the next working day. */
  carried_forward: boolean;
  /** Set when this came from the previous working day's Today automatically. */
  carried_from_date: string | null;
}

/** Plain-text work with no ticket behind it. */
export interface StandupTask {
  id: string;
  section: TaskSection;
  text: string;
  status: TaskStatus;
  created_by: string | null;
  created_at: string;
  carried_from: string | null;
  carried_forward: boolean;
}

/** Mirrors TASK_TEXT_MAX in backend/app/schemas/standup.py. */
export const TASK_TEXT_MAX = 500;

export interface BlockerNote {
  id: string;
  text: string;
  created_by: string | null;
  created_at: string;
  /** Set when it was carried over from an earlier day's blockers. */
  carried_from_date: string | null;
}

/** Mirrors BLOCKER_NOTE_MAX in backend/app/schemas/standup.py. */
export const BLOCKER_NOTE_MAX = 500;

export interface StandupPerson {
  email: string;
  name: string;
  photo: string | null;
  has_account: boolean;
  /** Whether the signed-in user may change this board (their own, or they're an admin). */
  can_edit: boolean;
  health: PersonHealth;
  counts: { completed: number; worked_on: number; today: number; blockers: number };
  yesterday: { items: StandupTicketRow[]; tasks: StandupTask[] };
  today: { items: StandupTicketRow[]; tasks: StandupTask[] };
  blockers: StandupTicketRow[];
  blocker_notes: BlockerNote[];
}

export interface StandupProject {
  id: number;
  key: string;
  name: string;
  color: string;
}

export interface StandupBoard {
  date: string;
  today: string;
  is_today: boolean;
  is_weekend: boolean;
  prev_date: string;
  next_date: string | null;
  /** Where carry forward from today lands: the next working day. */
  carry_forward_date: string;
  yesterday_window: { from: string; to: string; label: string; since_label: string };
  summary: { people: number; updated: number; no_update: number; completed: number; blockers: number; planned_today: number };
  projects: Record<string, StandupProject>;
  people: StandupPerson[];
  roster_is_default: boolean;
  is_admin: boolean;
  /** The signed-in user, so their own board opens first. */
  viewer_email: string;
}

export interface PersonTicketOption {
  id: number;
  project_id: number;
  key: string;
  title: string;
  type: string | null;
  status_name: string | null;
}

export interface RosterMember {
  email: string;
  name: string;
  photo: string | null;
  role: string | null;
  has_account: boolean;
  is_active: boolean;
}

export interface Roster {
  members: RosterMember[];
  is_default: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

/* ---------- errors ---------- */

/** The client helpers throw plain Errors; recover the status so screens can pick the right copy. */
export function errorStatus(error: unknown): number | 'offline' | 'timeout' | null {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'timeout';
  const match = error instanceof Error ? /status (\d{3})/.exec(error.message) : null;
  return match ? Number(match[1]) : null;
}

const REQUEST_TIMEOUT_MS = 15000;

/** A signal that aborts on the caller's signal or after the timeout, whichever comes first. */
function withTimeout(signal?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), REQUEST_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return controller.signal;
}

/* ---------- calls ---------- */

export const standupAPI = {
  getBoard: (date?: string, signal?: AbortSignal) =>
    apiGet<StandupBoard>(`/standup/board${date ? `?date=${encodeURIComponent(date)}` : ''}`, {
      signal: withTimeout(signal),
    }),

  setTodayItem: (body: { email: string; date: string; ticket_id: number }) =>
    apiPut<typeof body, typeof body>(
      '/standup/today',
      body,
      { signal: withTimeout() },
    ),

  removeTodayItem: ({ email, date, ticket_id }: { email: string; date: string; ticket_id: number }) => {
    const params = new URLSearchParams({ email, date, ticket_id: String(ticket_id) });
    return apiDelete(`/standup/today?${params.toString()}`, { signal: withTimeout() });
  },

  /** Move a card between Yesterday and Today. 409 when the other column already has it. */
  moveCard: (body: { email: string; date: string; kind: 'ticket' | 'task'; to: 'yesterday' | 'today'; ticket_id?: number; task_id?: string }) =>
    apiPost<typeof body, { to: 'yesterday' | 'today' }>('/standup/move', body, { signal: withTimeout() }),

  /** Add a ticket to someone's yesterday or blockers by hand. */
  addTicketItem: (section: AddedSection, body: { email: string; date: string; ticket_id: number }) =>
    apiPut<typeof body, typeof body & { section: AddedSection }>(`/standup/items/${section}`, body, { signal: withTimeout() }),

  removeTicketItem: (section: AddedSection, { email, date, ticket_id }: { email: string; date: string; ticket_id: number }) => {
    const params = new URLSearchParams({ email, date, ticket_id: String(ticket_id) });
    return apiDelete(`/standup/items/${section}?${params.toString()}`, { signal: withTimeout() });
  },

  addBlockerNote: (body: { email: string; date: string; text: string }) =>
    apiPost<typeof body, BlockerNote>('/standup/blockers', body, { signal: withTimeout() }),

  removeBlockerNote: (id: string) =>
    apiDelete(`/standup/blockers/${encodeURIComponent(id)}`, { signal: withTimeout() }),

  addTask: (body: { email: string; date: string; section: TaskSection; text: string; status: TaskStatus }) =>
    apiPost<typeof body, StandupTask>('/standup/tasks', body, { signal: withTimeout() }),

  updateTask: (id: string, changes: { text?: string; status?: TaskStatus }) =>
    apiPatch<typeof changes, StandupTask>(`/standup/tasks/${encodeURIComponent(id)}`, changes, { signal: withTimeout() }),

  removeTask: (id: string) => apiDelete(`/standup/tasks/${encodeURIComponent(id)}`, { signal: withTimeout() }),

  carryTaskForward: (id: string) =>
    apiPost<Record<string, never>, StandupTask>(`/standup/tasks/${encodeURIComponent(id)}/carry-forward`, {}, { signal: withTimeout() }),

  /** Tickets the given column's picker may offer; the server applies the same status rules as the board. */
  searchPersonTickets: (email: string, q: string, section: PickerSection, signal?: AbortSignal) => {
    const params = new URLSearchParams({ email, q });
    params.set('section', section);
    return apiGet<PersonTicketOption[]>(`/standup/tickets?${params.toString()}`, { signal: withTimeout(signal) });
  },

  /**
   * Downloads a person's whole standup history as a workbook. Goes through fetch
   * rather than the JSON helpers because the response is a file, not JSON.
   */
  exportWork: async (email: string, name: string) => {
    const response = await fetch(`${API_BASE_URL}/standup/export?email=${encodeURIComponent(email)}`, {
      credentials: 'include',
      cache: 'no-store',
      signal: withTimeout(),
    });
    if (!response.ok) throw new Error(`API GET /standup/export failed with status ${response.status}`);

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `standup-work-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export'}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  getRoster: () => apiGet<Roster>('/standup/roster', { signal: withTimeout() }),

  getRosterCandidates: () => apiGet<RosterMember[]>('/standup/roster/candidates', { signal: withTimeout() }),

  putRoster: (emails: string[]) =>
    apiPut<{ emails: string[] }, Roster>('/standup/roster', { emails }, { signal: withTimeout() }),
};
