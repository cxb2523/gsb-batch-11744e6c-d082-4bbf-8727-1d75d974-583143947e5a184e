/**
 * Board filter state, encoded in the URL.
 *
 * The URL is the single source of truth: filters are derived from the query string, never
 * held in parallel React state. That makes a filtered board shareable as a link, makes the
 * back button work, and removes any chance of restored state being clobbered by a render
 * that still holds the defaults.
 *
 * localStorage only remembers the last-used query string per project, so returning to the
 * board with a bare URL restores where you left off.
 */

export type FilterValue<T> = T | 'all';

export interface BoardFilters {
  search: string;
  assignee: FilterValue<number>;
  type: FilterValue<string>;
  epic: FilterValue<number>;
  priority: FilterValue<string>;
  label: FilterValue<string>;
  sprint: FilterValue<number>;
  groupBy: 'none' | 'assignee' | 'epic' | 'priority';
  showArchived: boolean;
}

export const DEFAULT_BOARD_FILTERS: BoardFilters = {
  search: '',
  assignee: 'all',
  type: 'all',
  epic: 'all',
  priority: 'all',
  label: 'all',
  sprint: 'all',
  groupBy: 'none',
  showArchived: false,
};

/** Query-string keys this module owns. Anything else in the URL is left untouched. */
export const BOARD_FILTER_PARAM_KEYS = [
  'q',
  'assignee',
  'type',
  'epic',
  'priority',
  'label',
  'sprint',
  'group',
  'archived',
] as const;

const GROUP_BY_VALUES: BoardFilters['groupBy'][] = ['none', 'assignee', 'epic', 'priority'];

function readNumber(raw: string | null): FilterValue<number> {
  if (!raw) return 'all';
  const n = parseInt(raw, 10);
  return isNaN(n) ? 'all' : n;
}

function readString(raw: string | null): FilterValue<string> {
  return raw && raw !== 'all' ? raw : 'all';
}

export function parseBoardFilters(params: URLSearchParams): BoardFilters {
  const group = params.get('group') as BoardFilters['groupBy'] | null;

  return {
    search: params.get('q') ?? '',
    assignee: readNumber(params.get('assignee')),
    type: readString(params.get('type')),
    epic: readNumber(params.get('epic')),
    priority: readString(params.get('priority')),
    label: readString(params.get('label')),
    sprint: readNumber(params.get('sprint')),
    groupBy: group && GROUP_BY_VALUES.includes(group) ? group : 'none',
    showArchived: params.get('archived') === '1',
  };
}

/**
 * Write filters onto a copy of `base`, so unrelated params (e.g. ?ticketId=) survive.
 * Values at their default are removed, keeping shared links clean.
 */
export function applyBoardFilters(filters: BoardFilters, base?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base?.toString() ?? '');

  const set = (key: string, value: string | null) => {
    if (value === null) params.delete(key);
    else params.set(key, value);
  };

  set('q', filters.search.trim() ? filters.search : null);
  set('assignee', filters.assignee === 'all' ? null : String(filters.assignee));
  set('type', filters.type === 'all' ? null : filters.type);
  set('epic', filters.epic === 'all' ? null : String(filters.epic));
  set('priority', filters.priority === 'all' ? null : filters.priority);
  set('label', filters.label === 'all' ? null : filters.label);
  set('sprint', filters.sprint === 'all' ? null : String(filters.sprint));
  set('group', filters.groupBy === 'none' ? null : filters.groupBy);
  set('archived', filters.showArchived ? '1' : null);

  return params;
}

/**
 * Filters that actually hide issues. groupBy and showArchived are excluded: grouping is a
 * layout choice, and "show archived" reveals issues rather than hiding them - counting
 * them would make the "Clear filters" badge lie about why the board looks empty.
 */
export function activeFilters(filters: BoardFilters): { key: keyof BoardFilters; value: string | number }[] {
  const active: { key: keyof BoardFilters; value: string | number }[] = [];
  if (filters.search.trim()) active.push({ key: 'search', value: filters.search.trim() });
  if (filters.assignee !== 'all') active.push({ key: 'assignee', value: filters.assignee });
  if (filters.type !== 'all') active.push({ key: 'type', value: filters.type });
  if (filters.epic !== 'all') active.push({ key: 'epic', value: filters.epic });
  if (filters.priority !== 'all') active.push({ key: 'priority', value: filters.priority });
  if (filters.label !== 'all') active.push({ key: 'label', value: filters.label });
  if (filters.sprint !== 'all') active.push({ key: 'sprint', value: filters.sprint });
  return active;
}

export function countActiveFilters(filters: BoardFilters): number {
  return activeFilters(filters).length;
}

/** True if the URL carries any board-filter param at all (so it should win over storage). */
export function hasFilterParams(params: URLSearchParams): boolean {
  return BOARD_FILTER_PARAM_KEYS.some((k) => params.has(k));
}

export function boardFiltersStorageKey(projectId: number): string {
  return `board_filters_${projectId}`;
}
