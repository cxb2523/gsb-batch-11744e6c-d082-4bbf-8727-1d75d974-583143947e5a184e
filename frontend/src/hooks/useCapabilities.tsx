'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { capabilitiesAPI, type Capabilities } from '../lib/api/capabilities';

interface CapabilitiesValue {
  /**
   * null means "not loaded yet, or the request failed". Callers treat an unknown
   * capability as off: a feature that needs configuration we cannot confirm is better
   * hidden than offered and broken. This is the opposite default from the navigation
   * config, where an outage degrades to showing everything - there, the items all
   * work; here, they may not.
   */
  capabilities: Capabilities | null;
}

const CapabilitiesContext = createContext<CapabilitiesValue | null>(null);

/**
 * Install-wide feature configuration, fetched once for the protected tree.
 *
 * These come from the server's environment, so nothing in the app can change them at
 * runtime and there is no publish/invalidate story to tell: an admin who edits the
 * environment restarts the backend, and every client picks the change up on its next
 * page load.
 */
export function CapabilitiesProvider({ children }: { children: React.ReactNode }) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);

  useEffect(() => {
    let cancelled = false;
    capabilitiesAPI
      .get()
      .then((data) => {
        if (!cancelled) setCapabilities(data);
      })
      .catch(() => {
        if (!cancelled) setCapabilities(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<CapabilitiesValue>(() => ({ capabilities }), [capabilities]);

  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>;
}

export function useCapabilities(): CapabilitiesValue {
  const context = useContext(CapabilitiesContext);
  if (!context) {
    throw new Error('useCapabilities must be used inside a CapabilitiesProvider');
  }
  return context;
}

/** True only once the server has confirmed it. Unknown reads as off; see above. */
export function useHasGoogleWorkspace(): boolean {
  const { capabilities } = useCapabilities();
  return capabilities?.google_workspace === true;
}
