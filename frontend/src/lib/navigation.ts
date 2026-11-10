import {
  List,
  LayoutGrid,
  Target,
  BarChart3,
  Package,
  Route,
  Users,
  Zap,
  Settings,
} from 'lucide-react';

export type NavSection = 'planning' | 'development' | 'operations' | 'project';

export interface NavCatalogItem {
  id: string;
  label: string;
  icon: React.ElementType;
  section: NavSection;
  /** Builds the href for a given project. */
  href: (projectId: number) => string;
  /**
   * Items a global admin may not hide. Settings is the way back to the screen that
   * would undo a bad config, so hiding it would be a one-way door. The server
   * enforces this too (ALWAYS_VISIBLE_NAV_IDS) — this flag only keeps the toggle
   * from being offered.
   */
  alwaysVisible?: boolean;
}

/**
 * The project nav items, in display order.
 *
 * This catalogue stays in the frontend on purpose. The backend stores only
 * {id: visible}, so a bad or stale config can hide an item but can never produce a
 * broken label or a dead link — which is exactly how the old, long-dead SidebarNav
 * ended up pointing at routes that never existed.
 *
 * Adding an item here needs no backend change: an id absent from the stored map is
 * treated as visible.
 */
export const NAV_CATALOG: NavCatalogItem[] = [
  { id: 'lifecycle', label: 'Lifecycle', icon: Route, section: 'planning', href: (id) => `/projects/${id}/lifecycle` },
  { id: 'backlog', label: 'Backlog', icon: List, section: 'planning', href: (id) => `/projects/${id}/backlog` },
  { id: 'board', label: 'Board', icon: LayoutGrid, section: 'planning', href: (id) => `/projects/${id}/board` },
  { id: 'sprint', label: 'Sprints', icon: Target, section: 'planning', href: (id) => `/projects/${id}/sprint` },
  { id: 'reports', label: 'Reports', icon: BarChart3, section: 'planning', href: (id) => `/projects/${id}/reports` },
  { id: 'epics', label: 'Epics', icon: Zap, section: 'planning', href: (id) => `/projects/${id}/epics` },

  { id: 'releases', label: 'Releases', icon: Package, section: 'development', href: (id) => `/projects/${id}/releases` },

  { id: 'members', label: 'Members', icon: Users, section: 'operations', href: (id) => `/projects/${id}/members` },

  { id: 'settings', label: 'Settings', icon: Settings, section: 'project', href: (id) => `/projects/${id}/settings`, alwaysVisible: true },
];

export const NAV_SECTION_LABELS: Record<NavSection, string> = {
  planning: 'PLANNING',
  development: 'DEVELOPMENT',
  operations: 'OPERATIONS',
  project: 'PROJECT',
};

/**
 * Absent means visible, so an install that has never configured anything behaves
 * exactly as it did before the config existed, and a newly added item appears
 * without anyone touching settings.
 */
export function isNavItemVisible(
  item: NavCatalogItem,
  config: Record<string, boolean> | null,
): boolean {
  if (item.alwaysVisible) return true;
  if (!config) return true;
  return config[item.id] !== false;
}
