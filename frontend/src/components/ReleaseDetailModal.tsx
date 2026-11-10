'use client';

import React from 'react';
import { ReleaseIcon } from './icons/ReleaseIcon';
import TicketDetailModal from './TicketDetailModal';
import { X, Rocket, FileText, Code, BarChart3, ClipboardList } from 'lucide-react';
import { Tab } from './releaseDetail/constants';
import { inputBaseStyle, handleInputFocus, handleInputBlur } from './releaseDetail/styles';
import { useReleaseDetail } from './releaseDetail/useReleaseDetail';
import { OverviewTab } from './releaseDetail/OverviewTab';
import { DeploymentsTab } from './releaseDetail/DeploymentsTab';
import { ChangelogTab } from './releaseDetail/ChangelogTab';
import { CommitsTab } from './releaseDetail/CommitsTab';
import { MetricsTab } from './releaseDetail/MetricsTab';
import { DeploymentModal } from './releaseDetail/DeploymentModal';

interface ReleaseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  releaseId: number;
  onReleaseUpdated?: () => void;
}

export const ReleaseDetailModal: React.FC<ReleaseDetailModalProps> = ({
  isOpen,
  onClose,
  projectId,
  releaseId,
  onReleaseUpdated,
}) => {
  const {
    release,
    filteredTickets,
    ticketSearchQuery,
    setTicketSearchQuery,
    isLoading,
    isLoadingTickets,
    isUpdatingStatus,
    isDeleting,
    error,
    showTickets,
    selectedTicketId,
    isTicketDetailModalOpen,
    isEditMode,
    activeTab,
    setActiveTab,
    isDeploymentModalOpen,
    setIsDeploymentModalOpen,
    deploymentFormData,
    setDeploymentFormData,
    isDeploying,
    editFormData,
    setEditFormData,
    handleViewTickets,
    handleTicketClick,
    handleCloseTicketDetail,
    handleTicketUpdated,
    handleStatusChange,
    handleEdit,
    handleCancelEdit,
    handleSaveEdit,
    handleDelete,
    handleDeploymentSubmit,
  } = useReleaseDetail({ isOpen, projectId, releaseId, onReleaseUpdated, onClose });

  if (!isOpen) return null;

  if (typeof document !== 'undefined') {
    const styleId = 'release-modal-animations';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <ClipboardList size={14} /> },
    { id: 'deployments', label: 'Deployments', icon: <Rocket size={14} /> },
    { id: 'changelog', label: 'Changelog', icon: <FileText size={14} /> },
    { id: 'commits', label: 'Commits', icon: <Code size={14} /> },
    { id: 'metrics', label: 'Metrics', icon: <BarChart3 size={14} /> },
  ];

  return (
    <>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(9, 30, 66, 0.54)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        fontFamily: 'var(--font-sans)',
      }}
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #DFE1E6',
          borderRadius: 12,
          width: '90%',
          maxWidth: 960,
          maxHeight: '92vh',
          overflow: 'hidden',
          boxShadow: '0px 8px 24px rgba(9, 30, 66, 0.12)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 24px',
            borderBottom: '1px solid #DFE1E6',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <div style={{
                width: 24,
                height: 24,
                borderRadius: 3,
                backgroundColor: '#DEEBFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <ReleaseIcon size={16} />
              </div>
              {isEditMode ? (
                <input
                  type="text"
                  value={editFormData.version}
                  onChange={(e) =>
                    // Version may contain only letters, digits and dots.
                    setEditFormData({ ...editFormData, version: e.target.value.replace(/[^A-Za-z0-9.]/g, '') })
                  }
                  placeholder="Version"
                  style={{
                    ...inputBaseStyle,
                    width: 120,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              ) : (
                <span style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#6B778C',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  flexShrink: 0,
                }}>
                  v{release?.version || '...'}
                </span>
              )}
              {!isEditMode && <span style={{ color: '#DFE1E6', flexShrink: 0 }}>·</span>}
              {isEditMode ? (
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  placeholder="Release name"
                  style={{
                    ...inputBaseStyle,
                    flex: 1,
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              ) : (
                <h2 style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#172B4D',
                  margin: 0,
                  letterSpacing: '-0.01em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}>
                  {release?.name || 'Loading...'}
                </h2>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                background: 'transparent',
                border: 'none',
                borderRadius: 3,
                color: '#42526E',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F4F5F7';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Tab Navigation */}
          <div style={{
            display: 'flex',
            gap: 4,
            padding: '0 24px',
            borderBottom: '1px solid #DFE1E6',
            overflowX: 'auto',
            // Without an explicit overflow-y the tabs' marginBottom:-1 (used to sit the
            // active underline on the border) makes the browser promote overflow-y to
            // auto, showing a stray 1px scrollbar. Pin it to visible to kill that.
            overflowY: 'hidden',
            flexShrink: 0,
            backgroundColor: '#FFFFFF',
          }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: activeTab === tab.id ? '#0052CC' : '#42526E',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid #0052CC' : '2px solid transparent',
                  marginBottom: -1,
                  cursor: 'pointer',
                  transition: 'color 0.15s ease',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.color = '#172B4D';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.color = '#42526E';
                  }
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: 24,
            backgroundColor: '#FFFFFF',
          }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  margin: '0 auto',
                  border: '3px solid #DFE1E6',
                  borderTopColor: '#0052CC',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <p style={{
                  marginTop: 12,
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#6B778C',
                }}>
                  Loading release...
                </p>
              </div>
            ) : error ? (
              <div style={{
                padding: '10px 12px',
                backgroundColor: '#FFEBE6',
                border: '1px solid #FFBDAD',
                borderRadius: 3,
                color: '#BF2600',
                marginBottom: 16,
                fontSize: 13,
              }}>
                {error}
              </div>
            ) : release ? (
              <>
                {activeTab === 'overview' && (
                  <OverviewTab
                    release={release}
                    isEditMode={isEditMode}
                    editFormData={editFormData}
                    setEditFormData={setEditFormData}
                    isUpdatingStatus={isUpdatingStatus}
                    isDeleting={isDeleting}
                    handleStatusChange={handleStatusChange}
                    handleEdit={handleEdit}
                    handleCancelEdit={handleCancelEdit}
                    handleSaveEdit={handleSaveEdit}
                    handleDelete={handleDelete}
                    isLoadingTickets={isLoadingTickets}
                    showTickets={showTickets}
                    handleViewTickets={handleViewTickets}
                    ticketSearchQuery={ticketSearchQuery}
                    setTicketSearchQuery={setTicketSearchQuery}
                    filteredTickets={filteredTickets}
                    handleTicketClick={handleTicketClick}
                  />
                )}

                {activeTab === 'deployments' && (
                  <DeploymentsTab
                    release={release}
                    onRecordDeployment={() => setIsDeploymentModalOpen(true)}
                  />
                )}

                {activeTab === 'changelog' && <ChangelogTab release={release} />}

                {activeTab === 'commits' && <CommitsTab release={release} />}

                {activeTab === 'metrics' && <MetricsTab release={release} />}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Deployment Modal */}
      {isDeploymentModalOpen && (
        <DeploymentModal
          deploymentFormData={deploymentFormData}
          setDeploymentFormData={setDeploymentFormData}
          handleDeploymentSubmit={handleDeploymentSubmit}
          isDeploying={isDeploying}
          onClose={() => setIsDeploymentModalOpen(false)}
        />
      )}

      {/* Ticket Detail Modal */}
      {selectedTicketId && (
        <TicketDetailModal
          isOpen={isTicketDetailModalOpen}
          onClose={handleCloseTicketDetail}
          projectId={projectId}
          ticketId={selectedTicketId}
          onTicketUpdated={handleTicketUpdated}
        />
      )}
    </>
  );
};

export default ReleaseDetailModal;
