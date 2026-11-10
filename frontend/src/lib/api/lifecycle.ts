import { API_BASE_URL, apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

/* ---------- types (mirror backend/app/schemas/lifecycle.py) ---------- */

export type StageState = 'not_started' | 'in_progress' | 'done' | 'blocked' | 'skipped';

export interface Person {
  email: string;
  name: string;
}

export interface LifecycleStage {
  key: string;
  /** The short name the team says out loud; `name` is the plain one. */
  codename: string | null;
  name: string;
  team: string | null;
  description: string | null;
  position: number;
  /** A checkpoint the team watches for: flagged on the route. */
  is_milestone: boolean;
  state: StageState;
  /** Everyone carrying this stage, in the order they were picked. */
  assignees: Person[];
  target_date: string | null;
  note: string | null;
  started_at: string | null;
  completed_at: string | null;
  /** Whole days spent in this stage, including a run still going. */
  days: number;
  is_overdue: boolean;
  /** Streams running side by side in this stage; each keeps its own record. */
  tracks: string[];
  /** So a card can show there is something to read without loading it. */
  remark_count: number;
  attachment_count: number;
}

export interface StageRemark {
  id: number;
  stage_key: string;
  /** Which stream of the stage this belongs to, or null when it has none. */
  track: string | null;
  body: string;
  author_email: string;
  author_name: string | null;
  created_at: string;
}

export interface StageAttachment {
  id: number;
  stage_key: string;
  track: string | null;
  /** "file" is stored by us and downloaded back; "link" points somewhere else. */
  kind: 'file' | 'link';
  label: string;
  url: string | null;
  content_type: string | null;
  size_bytes: number | null;
  added_by: string;
  added_by_name: string | null;
  created_at: string;
}

/** Everything hanging off one stage, loaded when its panel is opened. */
export interface StageDetail {
  stage_key: string;
  remarks: StageRemark[];
  attachments: StageAttachment[];
}

/** A ticket doing part of a module's work. */
export interface ModuleTicket {
  id: number;
  key: string;
  title: string;
  status: string;
  category: 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done';
  done: boolean;
  assignee_email: string | null;
  /** Subtasks under this ticket. They count towards the module's progress. */
  subtickets: ModuleTicket[];
}

export interface LifecycleModule {
  id: number;
  name: string;
  assignees: Person[];
  deadline: string | null;
  done: boolean;
  done_at: string | null;
  position: number;
  is_overdue: boolean;
  tickets: ModuleTicket[];
  /** Counted across the linked tickets and every subtask under them. */
  tickets_done: number;
  tickets_total: number;
  /** True once tickets are linked: the tickets decide, not the tick box. */
  done_from_tickets: boolean;
}

export interface LifecycleEvent {
  action: string;
  stage_key: string | null;
  stage_name: string | null;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  actor: string;
  actor_name: string | null;
  at: string;
}

export interface LifecycleSummary {
  total_days: number;
  stages_done: number;
  stages_total: number;
  modules_done: number;
  modules_total: number;
  started_on: string | null;
  delivered_on: string | null;
}

export interface Lifecycle {
  project_id: number;
  project_name: string;
  project_key: string;
  stages: LifecycleStage[];
  current_stage: string | null;
  modules: LifecycleModule[];
  summary: LifecycleSummary;
  can_edit: boolean;
}

export interface StageDraft {
  key?: string;
  codename?: string | null;
  name: string;
  is_milestone?: boolean;
  team?: string | null;
  description?: string | null;
}

/** Fields left out are unchanged; `clear` empties a field. */
export interface StagePatch {
  state?: StageState;
  /** The whole list, not a delta: send what the stage should end up with. */
  assignees?: string[];
  target_date?: string | null;
  note?: string | null;
  /** Recorded by hand when a project was running before it was tracked here. */
  started_at?: string | null;
  completed_at?: string | null;
  clear?: ('assignees' | 'target_date' | 'note' | 'started_at' | 'completed_at')[];
}

export interface ModulePatch {
  name?: string;
  /** The whole list, not a delta: send what the module should end up with. */
  assignees?: string[];
  deadline?: string | null;
  done?: boolean;
  clear?: ('assignees' | 'deadline')[];
}

const REQUEST_TIMEOUT_MS = 15000;

/** Aborts on the caller's signal or after the timeout, whichever comes first. */
function withTimeout(signal?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), REQUEST_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return controller.signal;
}

/** Recovers the status from the client helpers' plain Errors, so screens can pick the right copy. */
export function errorStatus(error: unknown): number | 'offline' | 'timeout' | null {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'timeout';
  const match = error instanceof Error ? /status (\d{3})/.exec(error.message) : null;
  return match ? Number(match[1]) : null;
}

/* ---------- calls ---------- */

/**
 * These deletes answer with the stage's remaining remarks and attachments, which
 * the shared `apiDelete` throws away, so they go through fetch directly. Errors
 * keep the same "... status NNN" shape, so `errorStatus` still reads them.
 */
async function deleteForDetail(path: string): Promise<StageDetail> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    signal: withTimeout(),
  });
  if (!response.ok) throw new Error(`Delete failed with status ${response.status}`);
  return response.json();
}

const base = (projectId: number) => `/projects/${projectId}/lifecycle`;
const stageBase = (projectId: number, stageKey: string) => `${base(projectId)}/stages/${encodeURIComponent(stageKey)}`;

export const lifecycleAPI = {
  get: (projectId: number, signal?: AbortSignal) =>
    apiGet<Lifecycle>(base(projectId), { signal: withTimeout(signal) }),

  updateStage: (projectId: number, stageKey: string, patch: StagePatch) =>
    apiPatch<StagePatch, Lifecycle>(`${base(projectId)}/stages/${encodeURIComponent(stageKey)}`, patch, { signal: withTimeout() }),

  /** Finishes `stageKey` and starts the next stage still to be done, in one write. */
  advance: (projectId: number, stageKey: string) =>
    apiPost<{ stage_key: string }, Lifecycle>(`${base(projectId)}/advance`, { stage_key: stageKey }, { signal: withTimeout() }),

  replaceFlow: (projectId: number, stages: StageDraft[]) =>
    apiPut<{ stages: StageDraft[] }, Lifecycle>(`${base(projectId)}/flow`, { stages }, { signal: withTimeout() }),

  addModule: (projectId: number, module: { name: string; assignees?: string[]; deadline?: string | null }) =>
    apiPost<typeof module, Lifecycle>(`${base(projectId)}/modules`, module, { signal: withTimeout() }),

  updateModule: (projectId: number, moduleId: number, patch: ModulePatch) =>
    apiPatch<ModulePatch, Lifecycle>(`${base(projectId)}/modules/${moduleId}`, patch, { signal: withTimeout() }),

  removeModule: (projectId: number, moduleId: number) =>
    apiDelete(`${base(projectId)}/modules/${moduleId}`, { signal: withTimeout() }),

  linkModuleTickets: (projectId: number, moduleId: number, ticketIds: number[]) =>
    apiPut<{ ticket_ids: number[] }, Lifecycle>(
      `${base(projectId)}/modules/${moduleId}/tickets`, { ticket_ids: ticketIds }, { signal: withTimeout() },
    ),

  searchTickets: (projectId: number, q: string, signal?: AbortSignal) =>
    apiGet<ModuleTicket[]>(`${base(projectId)}/tickets?q=${encodeURIComponent(q)}`, { signal: withTimeout(signal) }),

  reorderModules: (projectId: number, moduleIds: number[]) =>
    apiPut<{ module_ids: number[] }, Lifecycle>(`${base(projectId)}/modules/order`, { module_ids: moduleIds }, { signal: withTimeout() }),

  /* ---- what a stage carries ---- */

  stageDetail: (projectId: number, stageKey: string, signal?: AbortSignal) =>
    apiGet<StageDetail>(`${stageBase(projectId, stageKey)}/details`, { signal: withTimeout(signal) }),

  addRemark: (projectId: number, stageKey: string, body: string, track?: string | null) =>
    apiPost<{ body: string; track?: string | null }, StageDetail>(
      `${stageBase(projectId, stageKey)}/remarks`, { body, track }, { signal: withTimeout() },
    ),

  removeRemark: (projectId: number, stageKey: string, remarkId: number) =>
    deleteForDetail(`${stageBase(projectId, stageKey)}/remarks/${remarkId}`),

  addLink: (projectId: number, stageKey: string, url: string, label?: string, track?: string | null) =>
    apiPost<{ url: string; label?: string; track?: string | null }, StageDetail>(
      `${stageBase(projectId, stageKey)}/links`, { url, label, track }, { signal: withTimeout() },
    ),

  removeAttachment: (projectId: number, stageKey: string, attachmentId: number) =>
    deleteForDetail(`${stageBase(projectId, stageKey)}/attachments/${attachmentId}`),

  /** Where the browser fetches an uploaded file from; the session cookie authorises it. */
  downloadUrl: (projectId: number, stageKey: string, attachmentId: number) =>
    `${API_BASE_URL}${stageBase(projectId, stageKey)}/attachments/${attachmentId}/download`,

  /**
   * Multipart, so it goes straight to fetch rather than through the JSON helpers.
   * Errors are rethrown in the same "... status NNN" shape the helpers use, so
   * `errorStatus` keeps working for the copy the screen shows.
   */
  uploadFile: async (projectId: number, stageKey: string, file: File, track?: string | null): Promise<StageDetail> => {
    const body = new FormData();
    body.append('file', file);
    if (track) body.append('track', track);
    const response = await fetch(`${API_BASE_URL}${stageBase(projectId, stageKey)}/files`, {
      method: 'POST',
      body,
      credentials: 'include',
      cache: 'no-store',
      signal: withTimeout(),
    });
    if (!response.ok) throw new Error(`Upload failed with status ${response.status}`);
    return response.json();
  },

  /** Projects whose lifecycle has started and is not finished, for marking a list. */
  activeProjects: (signal?: AbortSignal) =>
    apiGet<{ project_ids: number[] }>('/projects/lifecycle/active', { signal: withTimeout(signal) }),

  activity: (projectId: number, signal?: AbortSignal) =>
    apiGet<LifecycleEvent[]>(`${base(projectId)}/activity?limit=100`, { signal: withTimeout(signal) }),
};
