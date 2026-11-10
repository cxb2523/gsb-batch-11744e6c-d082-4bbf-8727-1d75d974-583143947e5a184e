'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { organizationAPI } from '../lib/api/organization';

interface NavigationConfigValue {
  /**
   * item id -> visible. null means "not loaded yet, or the request failed"; callers
   * treat that as everything visible, so a config outage degrades to the old
   * behaviour rather than an empty sidebar.
   */
  config: Record<string, boolean> | null;
  /** Publish a map the caller just saved, so this tab updates without a reload. */
  publish: (config: Record<string, boolean>) => void;
}

const NavigationConfigContext = createContext<NavigationConfigValue | null>(null);

/**
 * Install-wide sidebar visibility, fetched once for the protected tree.
 *
 * `publish` exists so the admin who just saved sees the sidebar change immediately.
 * It only updates this tab: other users' sidebars change on their next page load,
 * which no client-side cache would fix either — invalidation only re-runs a fetch in
 * the tab that invalidated. For a setting a global admin changes rarely, that is the
 * right trade rather than polling every client.
 */
export function NavigationConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    let cancelled = false;
    organizationAPI
      .getNavigation()
      .then((data) => {
        if (!cancelled) setConfig(data.navigation);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const publish = useCallback((next: Record<string, boolean>) => setConfig(next), []);

  const value = useMemo<NavigationConfigValue>(() => ({ config, publish }), [config, publish]);

  return (
    <NavigationConfigContext.Provider value={value}>{children}</NavigationConfigContext.Provider>
  );
}

export function useNavigationConfig(): NavigationConfigValue {
  const context = useContext(NavigationConfigContext);
  if (!context) {
    throw new Error('useNavigationConfig must be used inside a NavigationConfigProvider');
  }
  return context;
}
