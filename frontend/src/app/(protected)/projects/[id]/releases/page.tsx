'use client';

import React, { useState, useEffect } from 'react';
import { ButtonCore } from '@/components/ui';
import { useParams } from 'next/navigation';
import { getReleases, Release } from '@/lib/api/releases';
import { CreateReleaseModal } from '@/components/CreateReleaseModal';
import { ReleaseDetailModal } from '@/components/ReleaseDetailModal';
import {
  Package,
  GitBranch,
  Calendar,
  Search,
  LayoutGrid,
  List as ListIcon,
  CheckCircle,
  TrendingUp,
  Plus,
  ChevronDown,
  Check,
  Flag,
} from 'lucide-react';

type ViewMode = 'grid' | 'list';

interface StatusVisual {
  label: string;
  color: string;
  bg: string;
}

const STATUS_VISUALS: Record<string, StatusVisual> = {
  planned: { label: 'Planned', color: '#5E6C84', bg: '#F4F5F7' },
  'in-progress': { label: 'In Progress', color: '#0052CC', bg: '#DEEBFF' },
  released: { label: 'Released', color: '#00875A', bg: '#E3FCEF' },
  archived: { label: 'Archived', color: '#97A0AF', bg: '#F4F5F7' },
};

const getStatusVisual = (status: string): StatusVisual =>
  STATUS_VISUALS[status] || { label: status, color: '#5E6C84', bg: '#F4F5F7' };

const ENV_VISUALS: Record<string, { label: string; color: string; bg: string }> = {
  production: { label: 'Production', color: '#00875A', bg: '#E3FCEF' },
  staging: { label: 'Staging', color: '#FF991F', bg: '#FFF7E6' },
  dev: { label: 'Dev', color: '#0052CC', bg: '#DEEBFF' },
  qa: { label: 'QA', color: '#5243AA', bg: '#EAE6FF' },
};

const getEnvVisual = (env: string) =>
  ENV_VISUALS[env.toLowerCase()] || { label: env, color: '#5E6C84', bg: '#F4F5F7' };

export default function ReleasesPage() {
  const params = useParams();
  const projectId = parseInt(params.id as string);

  const [releases, setReleases] = useState<Release[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedReleaseId, setSelectedReleaseId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const loadReleases = async () => {
    try {
      const data = await getReleases(projectId);
      setReleases(data);
    } catch (error) {
      console.error('Failed to load releases:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReleaseClick = (releaseId: number) => {
    setSelectedReleaseId(releaseId);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedReleaseId(null);
  };

  useEffect(() => {
    loadReleases();
  }, [projectId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-dropdown]')) {
        setShowStatusDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter releases
  const filteredReleases = releases.filter((release) => {
    const matchesStatus = !filterStatus || release.status === filterStatus;
    const matchesSearch =
      !searchQuery ||
      release.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      release.version.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (release.description && release.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  const stats = {
    total: releases.length,
    released: releases.filter((r) => r.status === 'released').length,
    inProgress: releases.filter((r) => r.status === 'in-progress').length,
    planned: releases.filter((r) => r.status === 'planned').length,
  };

  // Shared button styles
  const secondaryBtn: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    color: '#42526E',
    border: '1px solid #DFE1E6',
    borderRadius: 3,
    padding: '0 8px',
    height: 32,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: 'var(--font-sans)',
    transition: 'background-color 0.15s ease',
  };

  const statusOptions: { value: string; label: string }[] = [
    { value: '', label: 'All statuses' },
    { value: 'planned', label: 'Planned' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'released', label: 'Released' },
    { value: 'archived', label: 'Archived' },
  ];

  const selectedStatusLabel =
    statusOptions.find((o) => o.value === filterStatus)?.label || 'All statuses';

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F4F5F7',
        fontFamily: 'var(--font-sans)',
        color: '#172B4D',
      }}
    >
      {/* Page Header */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #DFE1E6',
          padding: '16px 24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 600,
                color: '#172B4D',
                lineHeight: 1.2,
              }}
            >
              Releases
            </h1>
            {!isLoading && stats.total > 0 && (
              <div
                style={{
                  fontSize: 13,
                  color: '#5E6C84',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>
                  {stats.total} {stats.total === 1 ? 'release' : 'releases'}
                </span>
                <span style={{ color: '#C1C7D0' }}>·</span>
                <span style={{ color: '#00875A' }}>{stats.released} released</span>
                <span style={{ color: '#C1C7D0' }}>·</span>
                <span style={{ color: '#0052CC' }}>{stats.inProgress} in progress</span>
                <span style={{ color: '#C1C7D0' }}>·</span>
                <span>{stats.planned} planned</span>
              </div>
            )}
          </div>
          <ButtonCore variant="primary" onClick={() => setIsCreateModalOpen(true)} leftIcon={<Plus size={14} />}>
            Create release
          </ButtonCore>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#5E6C84' }}>
          Manage release versions, track deployments, and monitor delivery metrics.
        </p>
      </div>

      {/* Toolbar */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #DFE1E6',
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search
            size={14}
            color="#8993A4"
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search releases..."
            style={{
              width: 240,
              height: 32,
              paddingLeft: 32,
              paddingRight: 12,
              border: '1px solid #DFE1E6',
              borderRadius: 3,
              backgroundColor: '#F4F5F7',
              color: '#172B4D',
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              outline: 'none',
              transition: 'all 0.15s ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
              e.currentTarget.style.borderColor = '#0052CC';
            }}
            onBlur={(e) => {
              e.currentTarget.style.backgroundColor = '#F4F5F7';
              e.currentTarget.style.borderColor = '#DFE1E6';
            }}
          />
        </div>

        {/* Status filter */}
        <div style={{ position: 'relative' }} data-dropdown>
          <button
            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            style={{
              ...secondaryBtn,
              backgroundColor: filterStatus ? 'rgba(0, 82, 204, 0.08)' : '#FFFFFF',
              borderColor: filterStatus ? '#0052CC' : '#DFE1E6',
              color: filterStatus ? '#0052CC' : '#42526E',
            }}
          >
            <Flag size={14} />
            <span>{selectedStatusLabel}</span>
            <ChevronDown size={14} />
          </button>
          {showStatusDropdown && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                minWidth: 200,
                backgroundColor: '#FFFFFF',
                border: '1px solid #DFE1E6',
                borderRadius: 3,
                boxShadow: '0 4px 8px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.04)',
                zIndex: 1000,
                padding: '4px 0',
              }}
            >
              {statusOptions.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => {
                    setFilterStatus(opt.value);
                    setShowStatusDropdown(false);
                  }}
                  style={{
                    padding: '8px 12px',
                    fontSize: 13,
                    fontWeight: filterStatus === opt.value ? 600 : 400,
                    color: filterStatus === opt.value ? '#0052CC' : '#42526E',
                    cursor: 'pointer',
                    backgroundColor:
                      filterStatus === opt.value ? 'rgba(0, 82, 204, 0.04)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onMouseEnter={(e) => {
                    if (filterStatus !== opt.value)
                      e.currentTarget.style.backgroundColor = '#F4F5F7';
                  }}
                  onMouseLeave={(e) => {
                    if (filterStatus !== opt.value)
                      e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span>{opt.label}</span>
                  {filterStatus === opt.value && <Check size={14} />}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* View toggle */}
        <div
          style={{
            display: 'flex',
            border: '1px solid #DFE1E6',
            borderRadius: 3,
            overflow: 'hidden',
            height: 32,
          }}
        >
          <button
            onClick={() => setViewMode('grid')}
            style={{
              padding: '0 10px',
              backgroundColor: viewMode === 'grid' ? '#DEEBFF' : '#FFFFFF',
              color: viewMode === 'grid' ? '#0052CC' : '#42526E',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
            }}
            title="Card view"
          >
            <LayoutGrid size={14} />
          </button>
          <div style={{ width: 1, backgroundColor: '#DFE1E6' }} />
          <button
            onClick={() => setViewMode('list')}
            style={{
              padding: '0 10px',
              backgroundColor: viewMode === 'list' ? '#DEEBFF' : '#FFFFFF',
              color: viewMode === 'list' ? '#0052CC' : '#42526E',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
            }}
            title="List view"
          >
            <ListIcon size={14} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ padding: '20px 24px' }}>
        {isLoading ? (
          <div
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              fontSize: 14,
              color: '#5E6C84',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                margin: '0 auto 12px',
                border: '3px solid #DFE1E6',
                borderTop: '3px solid #0052CC',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            Loading releases...
          </div>
        ) : filteredReleases.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #DFE1E6',
              borderRadius: 3,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                margin: '0 auto 16px',
                borderRadius: 3,
                backgroundColor: '#DEEBFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Package size={24} color="#0052CC" />
            </div>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: '#172B4D',
                margin: 0,
                marginBottom: 6,
              }}
            >
              {searchQuery || filterStatus ? 'No releases found' : 'No releases yet'}
            </h3>
            <p
              style={{
                fontSize: 13,
                color: '#5E6C84',
                margin: 0,
                marginBottom: 16,
                maxWidth: 420,
                marginLeft: 'auto',
                marginRight: 'auto',
                lineHeight: 1.5,
              }}
            >
              {searchQuery || filterStatus
                ? 'Try adjusting your search or filter criteria.'
                : 'Create your first release to start tracking version deployments and delivery milestones.'}
            </p>
            {!searchQuery && !filterStatus && (
              <ButtonCore variant="primary" onClick={() => setIsCreateModalOpen(true)} leftIcon={<Plus size={14} />}>
                Create your first release
              </ButtonCore>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: 12,
            }}
          >
            {filteredReleases.map((release) => {
              const statusVisual = getStatusVisual(release.status);

              return (
                <div
                  key={release.id}
                  onClick={() => handleReleaseClick(release.id)}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #DFE1E6',
                    borderRadius: 3,
                    padding: 16,
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#B3BAC5';
                    e.currentTarget.style.boxShadow = '0 1px 1px rgba(9, 30, 66, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#DFE1E6';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <GitBranch size={14} color="#5E6C84" />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#5E6C84',
                          letterSpacing: 0.5,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}
                      >
                        v{release.version}
                      </span>
                    </div>
                    <span
                      style={{
                        padding: '2px 6px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: statusVisual.color,
                        backgroundColor: statusVisual.bg,
                        borderRadius: 3,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {statusVisual.label}
                    </span>
                  </div>

                  <h3
                    style={{
                      margin: 0,
                      marginBottom: release.description ? 6 : 12,
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#172B4D',
                      lineHeight: 1.35,
                    }}
                  >
                    {release.name}
                  </h3>

                  {release.description && (
                    <p
                      style={{
                        margin: 0,
                        marginBottom: 12,
                        fontSize: 13,
                        color: '#5E6C84',
                        lineHeight: 1.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {release.description}
                    </p>
                  )}

                  {/* Deployment Environments */}
                  {release.current_environments && release.current_environments.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        marginBottom: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      {release.current_environments.map((env, idx) => {
                        const ev = getEnvVisual(env);
                        return (
                          <span
                            key={idx}
                            style={{
                              padding: '2px 6px',
                              fontSize: 11,
                              fontWeight: 500,
                              color: ev.color,
                              backgroundColor: ev.bg,
                              borderRadius: 3,
                              textTransform: 'capitalize',
                            }}
                          >
                            {env}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Footer */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: 12,
                      borderTop: '1px solid #DFE1E6',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle size={12} color="#5E6C84" />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#172B4D' }}>
                          {release.ticket_count}
                        </span>
                        <span style={{ fontSize: 12, color: '#5E6C84' }}>
                          {release.ticket_count === 1 ? 'ticket' : 'tickets'}
                        </span>
                      </div>

                      {release.metrics && release.metrics.deployment_count > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <TrendingUp size={12} color="#5E6C84" />
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#172B4D' }}>
                            {release.metrics.deployment_count}
                          </span>
                          <span style={{ fontSize: 12, color: '#5E6C84' }}>
                            {release.metrics.deployment_count === 1 ? 'deploy' : 'deploys'}
                          </span>
                        </div>
                      )}
                    </div>

                    {release.release_date && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={12} color="#5E6C84" />
                        <span style={{ fontSize: 12, color: '#42526E' }}>
                          {new Date(release.release_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // List View - table-style
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #DFE1E6',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: '#F4F5F7',
                    borderBottom: '1px solid #DFE1E6',
                  }}
                >
                  {['Release', 'Status', 'Environments', 'Tickets', 'Release Date'].map(
                    (label, i) => (
                      <th
                        key={i}
                        style={{
                          padding: '10px 12px',
                          textAlign: 'left',
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#5E6C84',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        {label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredReleases.map((release, index) => {
                  const statusVisual = getStatusVisual(release.status);
                  return (
                    <tr
                      key={release.id}
                      onClick={() => handleReleaseClick(release.id)}
                      style={{
                        borderBottom:
                          index < filteredReleases.length - 1 ? '1px solid #DFE1E6' : 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#F4F5F7';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <GitBranch size={14} color="#5E6C84" />
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#5E6C84',
                                letterSpacing: 0.5,
                                marginBottom: 2,
                                fontFamily:
                                  'ui-monospace, SFMono-Regular, Menlo, monospace',
                              }}
                            >
                              v{release.version}
                            </div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: '#172B4D',
                              }}
                            >
                              {release.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            padding: '2px 6px',
                            fontSize: 11,
                            fontWeight: 600,
                            color: statusVisual.color,
                            backgroundColor: statusVisual.bg,
                            borderRadius: 3,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                          }}
                        >
                          {statusVisual.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {release.current_environments && release.current_environments.length > 0 ? (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {release.current_environments.map((env, idx) => {
                              const ev = getEnvVisual(env);
                              return (
                                <span
                                  key={idx}
                                  style={{
                                    padding: '2px 6px',
                                    fontSize: 11,
                                    fontWeight: 500,
                                    color: ev.color,
                                    backgroundColor: ev.bg,
                                    borderRadius: 3,
                                    textTransform: 'capitalize',
                                  }}
                                >
                                  {env}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span style={{ fontSize: 13, color: '#97A0AF' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            fontSize: 13,
                            color: '#172B4D',
                            fontWeight: 500,
                          }}
                        >
                          {release.ticket_count}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {release.release_date ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Calendar size={12} color="#5E6C84" />
                            <span style={{ fontSize: 13, color: '#42526E' }}>
                              {new Date(release.release_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 13, color: '#97A0AF' }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedReleaseId && (
        <ReleaseDetailModal
          isOpen={isDetailModalOpen}
          onClose={handleCloseDetailModal}
          projectId={projectId}
          releaseId={selectedReleaseId}
          onReleaseUpdated={loadReleases}
        />
      )}

      <CreateReleaseModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        projectId={projectId}
        onReleaseCreated={loadReleases}
      />

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
