'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { apiGet } from '../lib/api/client';

export interface ContextProject {
  id: number;
  key: string;
  name: string;
  /**
   * The signed-in user's role on this project: "admin", "member" or "viewer".
   * Mirrors require_project_admin on the server, so UI gates agree with the API.
   * Served by GET /projects; older responses without it are treated as "member".
   */
  my_role?: string;
}

interface ProjectContextValue {
  /** Every project the signed-in user can see. Fetched once for the whole tree. */
  projects: ContextProject[];
  /** The project the current route is about, or the last one visited. */
  selectedProject: ContextProject | null;
  /** Same as selectedProject?.id, but available before the project list resolves. */
  projectId: number | null;
  /** True while the project list is in flight. */
  loading: boolean;
  /** Re-read the project list (after creating or archiving a project). */
  refresh: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

const STORAGE_KEY = 'selectedProjectId';

/**
 * The project id the URL is talking about, e.g. 9 for /projects/9/board.
 * Null on routes that aren't about one project (/dashboard, /projects, /standup).
 */
export function projectIdFromPath(pathname: string | null): number | null {
  const match = pathname?.match(/\/projects\/(\d+)/);
  if (!match) return null;
  const id = parseInt(match[1], 10);
  return Number.isNaN(id) ? null : id;
}

function readStoredProjectId(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const id = parseInt(stored, 10);
    return Number.isNaN(id) ? null : id;
  } catch {
    // Private mode or blocked storage: the URL still works, so this is not fatal.
    return null;
  }
}

function writeStoredProjectId(id: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    /* ignore */
  }
}

/**
 * Resolves "which project am I in" once, for the whole protected tree.
 *
 * The URL is the source of truth. localStorage is only a fallback for the routes
 * that legitimately have no project in their path (/dashboard, /settings today),
 * and it is kept warm so that fallback stays useful across reloads.
 *
 * Before this existed the sidebar, the top nav and the protected layout each
 * resolved the project themselves and each re-fetched the whole project list on
 * every route change.
 */
export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [projects, setProjects] = useState<ContextProject[]>([]);
  const [loading, setLoading] = useState(true);
  // Only consulted when the path has no project id; kept in state so that a
  // switch made elsewhere in this tab re-renders consumers without polling.
  const [storedProjectId, setStoredProjectId] = useState<number | null>(null);

  const urlProjectId = projectIdFromPath(pathname);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<ContextProject[]>('/projects');
      setProjects(data);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Once per mount, not once per navigation.
  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setStoredProjectId(readStoredProjectId());
  }, []);

  // Keep the fallback warm whenever the URL tells us something definite.
  useEffect(() => {
    if (urlProjectId === null) return;
    writeStoredProjectId(urlProjectId);
    setStoredProjectId(urlProjectId);
  }, [urlProjectId]);

  const projectId = urlProjectId ?? storedProjectId;

  const selectedProject = useMemo(
    () => (projectId === null ? null : projects.find((p) => p.id === projectId) ?? null),
    [projects, projectId],
  );

  const value = useMemo<ProjectContextValue>(
    () => ({ projects, selectedProject, projectId, loading, refresh }),
    [projects, selectedProject, projectId, loading, refresh],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjectContext(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectContext must be used inside a ProjectProvider');
  }
  return context;
}

/**
 * The project id of a /projects/[id]/... route, straight from the route param.
 *
 * For pages that only ever render under that segment. Unlike useProjectContext it
 * needs no provider and no fetch, and it cannot disagree with the URL.
 */
export function useProjectIdParam(): number {
  const params = useParams();
  return parseInt(params.id as string, 10);
}

/**
 * Swap the project in the current path, keeping the view.
 *
 * /projects/9/board -> /projects/3/board. Paths that aren't about a single
 * project (/dashboard, /projects) fall back to the project's board.
 */
export function swapProjectInPath(pathname: string | null, nextProjectId: number): string {
  if (pathname && /\/projects\/\d+/.test(pathname)) {
    return pathname.replace(/\/projects\/\d+/, `/projects/${nextProjectId}`);
  }
  return `/projects/${nextProjectId}/board`;
}
