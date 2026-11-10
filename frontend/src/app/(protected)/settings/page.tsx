'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tokens } from '../../../design-system/tokens';
import { useProjectContext } from '../../../hooks/useProjectContext';

/**
 * Project settings moved to /projects/{id}/settings, where the project is in the URL
 * instead of in localStorage.
 *
 * This route stays as a redirect for old bookmarks and for the Slack OAuth failure
 * callbacks, which have no project id to redirect to (see routes/slack.py) and so
 * depend on this page resolving the last project visited.
 */
export default function SettingsRedirect() {
  const router = useRouter();
  const { projectId, loading } = useProjectContext();

  useEffect(() => {
    if (loading) return;
    router.replace(projectId ? `/projects/${projectId}/settings/general` : '/projects');
  }, [projectId, loading, router]);

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
      Taking you to project settings...
    </div>
  );
}
