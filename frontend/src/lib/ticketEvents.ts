'use client';

import { useEffect, useRef } from 'react';

/**
 * Cross-tree signal that a project's issues changed.
 *
 * Quick add and bulk import live in the protected layout, above the pages that
 * render issues, and every page loads its own tickets with `useEffect` + fetch.
 * `router.refresh()` does nothing for that — it only re-runs server components —
 * so a created issue never appeared until a manual reload.
 */

const EVENT = 'grid:tickets-changed';

export function emitTicketsChanged(projectId: number) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { projectId } }));
}

/** Re-runs `onChange` when issues change in any project — for cross-project views like the standup. */
export function useAnyTicketsChanged(onChange: () => void) {
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    const handler = () => latest.current();
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
}

/** Re-runs `onChange` whenever issues change for this project. */
export function useTicketsChanged(projectId: number | undefined, onChange: () => void) {
  // Callers pass a plain function that is re-created every render; keeping it in
  // a ref means the listener is attached once instead of on every render.
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    if (!projectId || Number.isNaN(projectId)) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: number }>).detail;
      // A board left open for another project should not refetch.
      if (!detail || detail.projectId === projectId) latest.current();
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, [projectId]);
}
