'use client';

import React from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { Settings as SettingsIcon } from 'lucide-react';
import { SettingsTabs } from '../../../../../design-system/components';
import { tokens } from '../../../../../design-system/tokens';
import { useProjectContext } from '../../../../../hooks/useProjectContext';

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'labels', label: 'Labels' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'reports', label: 'Reports' },
];

function Centered({ children }: { children: React.ReactNode }) {
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
      {children}
    </div>
  );
}

/**
 * Shell for a project's settings: the tab strip, and the gate that covers every tab.
 *
 * The gate lives here rather than on each page so it cannot be walked around by
 * typing a tab's URL — which is exactly what the old /settings allowed, since only
 * its index page checked anything.
 *
 * It gates on the project role, matching require_project_admin on the server (global
 * admin, or a project member whose role is "admin"). The old screen gated on the
 * install-wide role, which locked out project admins the API would have accepted.
 */
export default function ProjectSettingsLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const projectId = parseInt(params.id as string, 10);
  const { projects, loading } = useProjectContext();

  const project = projects.find((p) => p.id === projectId);
  const activeId = tabs.find((t) => pathname?.endsWith(`/${t.id}`))?.id ?? 'general';

  if (loading) {
    return <Centered>Loading...</Centered>;
  }

  // Not in the list means either no such project or no access to it; the API would
  // answer 403/404 either way, so there is nothing useful to distinguish here.
  if (!project) {
    return <Centered>Project not found, or you do not have access to it.</Centered>;
  }

  if (project.my_role !== 'admin') {
    return <Centered>Access denied. Project admin privileges required.</Centered>;
  }

  return (
    <div
      style={{
        paddingInline: 180,
        paddingBlock: 24,
        fontFamily: tokens.fontFamily.sans,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <SettingsIcon size={24} color={tokens.colors.neutral[900]} />
        <h1
          style={{
            fontSize: tokens.typography.styles.h1.fontSize,
            lineHeight: `${tokens.typography.styles.h1.lineHeight}px`,
            fontWeight: tokens.typography.styles.h1.fontWeight,
            letterSpacing: tokens.typography.styles.h1.letterSpacing,
            color: tokens.colors.neutral[900],
            margin: 0,
          }}
        >
          {project.name} settings
        </h1>
      </div>

      <SettingsTabs
        items={tabs}
        activeId={activeId}
        onChange={(id) => router.push(`/projects/${projectId}/settings/${id}`)}
      />

      {children}
    </div>
  );
}
