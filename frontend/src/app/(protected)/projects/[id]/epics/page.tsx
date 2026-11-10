'use client';

import React from 'react';
import { ButtonCore } from '@/components/ui';
import { CreateEpicModal } from '@/components/CreateEpicModal';
import { EpicDetailModal } from '@/components/EpicDetailModal';
import { Plus } from 'lucide-react';
import { useEpicsPage } from './useEpicsPage';
import { EpicsToolbar } from './EpicsToolbar';
import { EpicCard } from './EpicCard';
import { EpicsTable } from './EpicsTable';
import { EpicsEmptyState } from './EpicsEmptyState';

export default function EpicsPage() {
  const {
    projectId,
    isLoading,
    isCreateModalOpen,
    setIsCreateModalOpen,
    isDetailModalOpen,
    selectedEpicId,
    searchQuery,
    setSearchQuery,
    filterStatus,
    setFilterStatus,
    filterAssignee,
    setFilterAssignee,
    members,
    showStatusDropdown,
    setShowStatusDropdown,
    showAssigneeDropdown,
    setShowAssigneeDropdown,
    showSortDropdown,
    setShowSortDropdown,
    viewMode,
    setViewMode,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    loadEpics,
    handleEpicClick,
    handleCloseDetailModal,
    stats,
    filteredEpics,
    handleExportCSV,
    selectedStatusLabel,
    selectedAssigneeName,
    selectedSortLabel,
  } = useEpicsPage();

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
              Epics
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
                <span>{stats.total} {stats.total === 1 ? 'epic' : 'epics'}</span>
                <span style={{ color: '#C1C7D0' }}>·</span>
                <span style={{ color: '#00875A' }}>{stats.completed} completed</span>
                <span style={{ color: '#C1C7D0' }}>·</span>
                <span style={{ color: '#0052CC' }}>{stats.inProgress} in progress</span>
                {stats.atRisk > 0 && (
                  <>
                    <span style={{ color: '#C1C7D0' }}>·</span>
                    <span style={{ color: '#FF991F' }}>{stats.atRisk} at risk</span>
                  </>
                )}
              </div>
            )}
          </div>
          <ButtonCore variant="primary" onClick={() => setIsCreateModalOpen(true)} leftIcon={<Plus size={14} />}>
            Create epic
          </ButtonCore>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: '#5E6C84',
          }}
        >
          Organize related work into large features and strategic initiatives.
        </p>
      </div>

      {/* Toolbar */}
      <EpicsToolbar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        filterAssignee={filterAssignee}
        setFilterAssignee={setFilterAssignee}
        members={members}
        showStatusDropdown={showStatusDropdown}
        setShowStatusDropdown={setShowStatusDropdown}
        showAssigneeDropdown={showAssigneeDropdown}
        setShowAssigneeDropdown={setShowAssigneeDropdown}
        showSortDropdown={showSortDropdown}
        setShowSortDropdown={setShowSortDropdown}
        sortField={sortField}
        setSortField={setSortField}
        sortDirection={sortDirection}
        setSortDirection={setSortDirection}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onExportCSV={handleExportCSV}
        canExport={filteredEpics.length > 0}
        selectedStatusLabel={selectedStatusLabel}
        selectedAssigneeName={selectedAssigneeName}
        selectedSortLabel={selectedSortLabel}
      />

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
            Loading epics...
          </div>
        ) : filteredEpics.length === 0 ? (
          <EpicsEmptyState
            hasFilters={!!(searchQuery || filterStatus)}
            onCreate={() => setIsCreateModalOpen(true)}
          />
        ) : viewMode === 'card' ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 12,
            }}
          >
            {filteredEpics.map((epic) => (
              <EpicCard key={epic.id} epic={epic} onClick={() => handleEpicClick(epic.id)} />
            ))}
          </div>
        ) : (
          <EpicsTable epics={filteredEpics} onEpicClick={handleEpicClick} />
        )}
      </div>

      {/* Epic Detail Modal */}
      {selectedEpicId && (
        <EpicDetailModal
          isOpen={isDetailModalOpen}
          onClose={handleCloseDetailModal}
          projectId={projectId}
          epicId={selectedEpicId}
          onEpicUpdated={loadEpics}
        />
      )}

      {/* Create Epic Modal */}
      <CreateEpicModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        projectId={projectId}
        onEpicCreated={loadEpics}
      />

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
