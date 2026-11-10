'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopNavigationBar } from '../../components/TopNavigationBar';
import { CollapsibleSidebar } from '../../components/CollapsibleSidebar';
import CreateIssueModal from '../../components/CreateIssueModal';
import { apiGet } from '../../lib/api/client';
import { emitTicketsChanged } from '../../lib/ticketEvents';
import { ToastProvider, useToast } from '../../components/ui';
import ForcePasswordReset from '../../components/ForcePasswordReset';
import { ProjectProvider, useProjectContext } from '../../hooks/useProjectContext';
import { NavigationConfigProvider } from '../../hooks/useNavigationConfig';
import { CapabilitiesProvider } from '../../hooks/useCapabilities';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  must_change_password?: boolean;
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ProjectProvider>
        <NavigationConfigProvider>
          <CapabilitiesProvider>
            <ProtectedShell>{children}</ProtectedShell>
          </CapabilitiesProvider>
        </NavigationConfigProvider>
      </ProjectProvider>
    </ToastProvider>
  );
}

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  // The project context resolves this from the URL first, falling back to the last
  // project visited. Read on click, never during render (that breaks SSR and made the
  // button a silent no-op when the key was missing).
  const { projectId: contextProjectId } = useProjectContext();
  // Which project a globally-created issue belongs to.
  const [createProjectId, setCreateProjectId] = useState(0);

  const resolveProjectId = (action: string): number | null => {
    if (!contextProjectId) {
      toast.error(`Pick a project first, then ${action}.`);
      router.push('/projects');
      return null;
    }
    return contextProjectId;
  };

  const openCreateModal = () => {
    const projectId = resolveProjectId('create an issue');
    if (projectId === null) return;
    setCreateProjectId(projectId);
    setIsCreateModalOpen(true);
  };

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    // Check if user is authenticated
    const checkAuth = async () => {
      try {
        const userData = await apiGet<User>('/auth/me');
        setUser(userData);
        setLoading(false);
      } catch (error) {
        // Not authenticated, redirect to login
        router.push('/login');
      }
    };

    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#f9fafb',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: '3px solid #e5e7eb',
              borderTopColor: '#155dfc',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <div style={{ fontSize: 14, color: '#6a7282' }}>Loading...</div>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Admin-created accounts must set their own password before using the app.
  if (user?.must_change_password) {
    return (
      <ForcePasswordReset
        onDone={() => setUser((u) => (u ? { ...u, must_change_password: false } : u))}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top Navigation Bar */}
      <TopNavigationBar
        user={user || undefined}
        onCreateClick={openCreateModal}
      />

      {/* Main Layout (Sidebar + Content) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Collapsible Sidebar */}
        <CollapsibleSidebar />

        {/* Page Content */}
        <main
          style={{
            flex: 1,
            overflow: 'auto',
            background: '#F4F5F7',
          }}
        >
          {children}
        </main>
      </div>

      {/* Create Issue Modal */}
      {createProjectId > 0 && (
        <CreateIssueModal
          isOpen={isCreateModalOpen}
          projectId={createProjectId}
          onClose={() => setIsCreateModalOpen(false)}
          onIssueCreated={() => {
            setIsCreateModalOpen(false);
            emitTicketsChanged(createProjectId);
          }}
        />
      )}
    </div>
  );
}
