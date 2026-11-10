'use client';

import React, { useEffect, useState } from 'react';
import { ButtonCore } from '@/components/ui';
import { useRouter } from 'next/navigation';
import { apiGet } from '../../../lib/api/client';
import { useAuth } from '../../../hooks/useAuth';
import { tokens } from '../../../design-system/tokens';
import { Search, ClipboardList } from 'lucide-react';

interface Owner {
  id: number;
  name: string;
  email: string;
}

type ProjectStatus = 'active' | 'archived';

interface Project {
  id: number;
  key: string;
  name: string;
  description?: string;
  visibility: string;
  created_at: string;
  owner: Owner;
  member_count: number;
  // May hold legacy values ('in_progress' | 'done') from before those statuses were removed.
  status?: string;
}

// Collapse any stored status down to the two we support now; legacy values map to 'active'.
function normalizeStatus(status?: string): ProjectStatus {
  return status === 'archived' ? 'archived' : 'active';
}

export default function ProjectsPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await apiGet<Project[]>('/projects');
        setProjects(data);

        // Load selected project from localStorage
        const storedId = localStorage.getItem('selectedProjectId');
        if (storedId) {
          const projectId = parseInt(storedId);
          if (!isNaN(projectId) && data.find((p) => p.id === projectId)) {
            setSelectedProjectId(projectId);
          }
        }
      } catch (error) {
        console.error('Failed to fetch projects:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  const handleProjectSelect = (projectId: number) => {
    setSelectedProjectId(projectId);
    localStorage.setItem('selectedProjectId', projectId.toString());
    // Navigate to the board of the selected project
    router.push(`/projects/${projectId}/board`);
  };

  // Filter projects
  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.description || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || normalizeStatus(project.status) === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 14, color: tokens.colors.semantic.text.secondary }}>Loading projects...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--font-sans)',
                fontSize: 30,
                fontWeight: 600,
                lineHeight: '36px',
                color: tokens.colors.semantic.text.primary,
                marginBottom: 4,
              }}
            >
              Projects
            </h1>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                fontWeight: 400,
                color: tokens.colors.semantic.text.secondary,
              }}
            >
              {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
            </p>
          </div>
          {isAdmin && (
            <ButtonCore
              variant="primary"
              size="lg"
              onClick={() => router.push('/projects/create')}
              leftIcon={
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3.5V12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M3.5 8H12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              }
            >
              Create Project
            </ButtonCore>
          )}
        </div>

        {/* Search and Filters */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* Search */}
          <div style={{ flex: 1, position: 'relative' }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            >
              <circle cx="7" cy="7" r="4" stroke={tokens.colors.semantic.text.tertiary} strokeWidth="1.5" fill="none" />
              <path d="M10 10l3 3" stroke={tokens.colors.semantic.text.tertiary} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search projects by name, key, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: 40,
                padding: '0 16px 0 40px',
                background: tokens.colors.semantic.background.secondary,
                border: `1px solid ${tokens.colors.semantic.border.default}`,
                borderRadius: 8,
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                color: tokens.colors.semantic.text.primary,
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.primary[500];
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.semantic.border.default;
              }}
            />
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {(['all', 'active', 'archived'] as const).map((status) => {
              const isActive = statusFilter === status;
              const labels = {
                all: 'All',
                active: 'Active',
                archived: 'Archived',
              };
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  style={{
                    padding: '8px 14px',
                    background: isActive
                      ? tokens.colors.primary[500]
                      : tokens.colors.semantic.background.secondary,
                    border: `1px solid ${isActive ? tokens.colors.primary[500] : tokens.colors.semantic.border.default}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive
                      ? tokens.colors.semantic.text.inverse
                      : tokens.colors.semantic.text.secondary,
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = tokens.colors.semantic.background.tertiary;
                      e.currentTarget.style.borderColor = tokens.colors.semantic.border.hover;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = tokens.colors.semantic.background.secondary;
                      e.currentTarget.style.borderColor = tokens.colors.semantic.border.default;
                    }
                  }}
                >
                  {labels[status]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Projects Grid - Scrollable */}
      {filteredProjects.length === 0 ? (
        <div
          style={{
            background: tokens.colors.semantic.background.default,
            borderRadius: 12,
            padding: 48,
            textAlign: 'center',
            border: `1px solid ${tokens.colors.semantic.border.default}`,
          }}
        >
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center', color: tokens.colors.semantic.text.tertiary }}>
            {searchQuery || statusFilter !== 'all'
              ? <Search size={48} strokeWidth={1.5} />
              : <ClipboardList size={48} strokeWidth={1.5} />}
          </div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, marginBottom: 8, color: tokens.colors.semantic.text.primary }}>
            {searchQuery || statusFilter !== 'all' ? 'No projects found' : 'No projects yet'}
          </h3>
          <p style={{ margin: 0, fontSize: 14, color: tokens.colors.semantic.text.secondary, marginBottom: 24 }}>
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your search or filters'
              : isAdmin
              ? 'Create your first project to get started'
              : 'No projects available. Contact an admin to create projects.'}
          </p>
          {isAdmin && !searchQuery && statusFilter === 'all' && (
            <ButtonCore
              variant="primary"
              size="lg"
              onClick={() => router.push('/projects/create')}
              leftIcon={
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3.5V12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M3.5 8H12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              }
            >
              Create Project
            </ButtonCore>
          )}
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            // Padding gives the hover lift + shadow room so the top row isn't
            // clipped by the scroll container (looked like cards slid under the header).
            paddingTop: 6,
            paddingLeft: 4,
            paddingRight: 4,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16,
              paddingBottom: 24,
            }}
          >
            {filteredProjects.map((project) => {
              const isSelected = selectedProjectId === project.id;
              const projectStatus = normalizeStatus(project.status);
              const statusColors = {
                active: tokens.colors.success[500],
                archived: tokens.colors.semantic.text.tertiary,
              };
              return (
                <div
                  key={project.id}
                  data-testid="project-card"
                  data-project-id={project.id}
                  style={{
                    background: tokens.colors.semantic.background.default,
                    border: isSelected
                      ? `2px solid ${tokens.colors.primary[500]}`
                      : `1px solid ${tokens.colors.semantic.border.default}`,
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative',
                    boxShadow: isSelected ? tokens.shadows.sm : 'none',
                  }}
                  onClick={() => handleProjectSelect(project.id)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = tokens.shadows.md;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = isSelected ? tokens.shadows.sm : 'none';
                  }}
                >
                  {/* Header Row: Title and Key */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3
                        style={{
                          margin: 0,
                          fontFamily: 'var(--font-sans)',
                          fontSize: 16,
                          fontWeight: 600,
                          lineHeight: '22px',
                          color: tokens.colors.semantic.text.primary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {project.name}
                      </h3>
                      {isSelected && (
                        <div
                          style={{
                            marginTop: 4,
                            display: 'inline-block',
                            background: tokens.gradients.primary,
                            color: tokens.colors.semantic.text.inverse,
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 600,
                            fontFamily: 'var(--font-sans)',
                            letterSpacing: '0.3px',
                            textTransform: 'uppercase',
                          }}
                        >
                          Selected
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        background: tokens.colors.primary[50],
                        color: tokens.colors.primary[700],
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: 'var(--font-sans)',
                        letterSpacing: '0.3px',
                        flexShrink: 0,
                      }}
                    >
                      {project.key}
                    </div>
                  </div>

                  {/* Description */}
                  <p
                    style={{
                      margin: 0,
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13,
                      lineHeight: '18px',
                      color: tokens.colors.semantic.text.secondary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      minHeight: 36,
                    }}
                  >
                    {project.description || 'No description'}
                  </p>

                  {/* Metadata Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      paddingTop: 8,
                      borderTop: `1px solid ${tokens.colors.semantic.border.default}`,
                      fontSize: 12,
                      color: tokens.colors.semantic.text.tertiary,
                    }}
                  >
                    {/* Status Badge */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: statusColors[projectStatus],
                        }}
                      />
                      <span style={{ fontSize: 11, textTransform: 'capitalize' }}>
                        {projectStatus.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Visibility */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {project.visibility === 'public' ? (
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
                          <path d="M8 2v1M8 13v1M2 8h1M13 8h1" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <rect x="4" y="7" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
                          <path d="M6 7V5a2 2 0 014 0v2" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      )}
                      <span style={{ fontSize: 11, textTransform: 'capitalize' }}>
                        {project.visibility}
                      </span>
                    </div>

                    {/* Members */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M11 14v-1a3 3 0 00-3-3H5a3 3 0 00-3 3v1M6.5 7a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          fill="none"
                        />
                      </svg>
                      <span style={{ fontSize: 11 }}>{project.member_count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
