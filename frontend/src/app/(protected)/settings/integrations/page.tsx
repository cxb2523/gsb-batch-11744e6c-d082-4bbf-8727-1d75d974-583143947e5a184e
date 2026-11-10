'use client';

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { tokens } from '../../../../design-system/tokens';
import { useProjectContext } from '../../../../hooks/useProjectContext';

/**
 * Redirect for the Slack OAuth failure callbacks.
 *
 * Those fire before the stored state record is readable, so they have no project id
 * (see routes/slack.py) and still land here. Resolve the last project visited and
 * carry the error through, so the integrations screen can still explain what failed.
 */
export default function IntegrationsSettingsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { projectId, loading } = useProjectContext();

  useEffect(() => {
    if (loading) return;
    if (!projectId) {
      router.replace('/projects');
      return;
    }
    const query = searchParams?.toString();
    router.replace(
      `/projects/${projectId}/settings/integrations${query ? `?${query}` : ''}`,
    );
  }, [projectId, loading, router, searchParams]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: tokens.fontFamily.sans,
        fontSize: tokens.typography.styles.bodyMedium.fontSize,
        color: tokens.colors.neutral[900],
      }}
    >
      Taking you to integrations...
    </div>
  );
}
