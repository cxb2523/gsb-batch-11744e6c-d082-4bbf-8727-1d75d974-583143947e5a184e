'use client';

import React from 'react';
import { SprintState } from '../../../../../lib/api/sprints';
import CreateIssueModal from '../../../../../components/CreateIssueModal';
import TicketDetailModal from '../../../../../components/TicketDetailModal';
import CreateSprintModal from '../../../../../components/CreateSprintModal';
import CompleteSprintModal from '../../../../../components/CompleteSprintModal';
import StartSprintModal from '../../../../../components/StartSprintModal';
import { BulkActionBar } from '../../../../../components/board/BulkActionBar';
import { COLORS } from './constants';
import { BacklogTicket } from './types';
import { useBacklog } from './useBacklog';
import { BacklogToolbar } from './BacklogToolbar';
import { BacklogList } from './BacklogList';
import { SprintPanel } from './SprintPanel';

export default function BacklogPage() {
  const {
    projectId,
    tickets,
    pageIndex,
    nextCursor,
    total,
    totalPages,
    sprintTickets,
    sprints,
    members,
    statuses,
    epicsList,
    filteredEpics,
    labels,
    selectedIds,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    epicsOpen,
    setEpicsOpen,
    ticketsOpen,
    setTicketsOpen,
    showCreateModal,
    setShowCreateModal,
    showCreateSprintModal,
    setShowCreateSprintModal,
    completingSprint,
    setCompletingSprint,
    startSprintTarget,
    setStartSprintTarget,
    selectedTicketId,
    setSelectedTicketId,
    dragOverSprint,
    editingStoryPoints,
    setEditingStoryPoints,
    expandedSprints,
    assigneeFilter,
    setAssigneeFilter,
    typeFilter,
    setTypeFilter,
    priorityFilter,
    setPriorityFilter,
    statusFilter,
    setStatusFilter,
    epicFilter,
    setEpicFilter,
    openDropdown,
    setOpenDropdown,
    ticketById,
    activeSprints,
    futureSprints,
    closedSprints,
    goToNextPage,
    goToPrevPage,
    refreshAll,
    toggleSprint,
    handleToggleSelect,
    clearSelection,
    applyBulkUpdate,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleStoryPointsUpdate,
    handleCreateSprint,
    handleStartSprint,
    confirmStartSprint,
    handleCompleteSprint,
    confirmCompleteSprint,
  } = useBacklog();

  // Full-screen loader only on the initial load; page navigation dims the list
  // in place instead (the pager shows a "Loading…" label).
  if (loading && tickets.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: COLORS.background }}>
        <div style={{ fontSize: 14, color: COLORS.textSecondary }}>Loading backlog...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: COLORS.background }}>
        <div style={{ textAlign: 'center', padding: 24, background: COLORS.cardBg, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 8 }}>Error</div>
          <div style={{ fontSize: 14, color: COLORS.textSecondary }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: COLORS.background, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <BacklogToolbar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onCreateIssue={() => setShowCreateModal(true)}
        members={members}
        statuses={statuses}
        epicsList={epicsList}
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        assigneeFilter={assigneeFilter}
        setAssigneeFilter={setAssigneeFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        priorityFilter={priorityFilter}
        setPriorityFilter={setPriorityFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        epicFilter={epicFilter}
        setEpicFilter={setEpicFilter}
      />

      {/* Two-Pane Layout */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <BacklogList
          total={total}
          epicsOpen={epicsOpen}
          setEpicsOpen={setEpicsOpen}
          epicsList={filteredEpics}
          onSelectTicket={setSelectedTicketId}
          ticketsOpen={ticketsOpen}
          setTicketsOpen={setTicketsOpen}
          tickets={tickets}
          searchQuery={searchQuery}
          loading={loading}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          editingStoryPoints={editingStoryPoints}
          setEditingStoryPoints={setEditingStoryPoints}
          onStoryPointsUpdate={handleStoryPointsUpdate}
          goToPrevPage={goToPrevPage}
          goToNextPage={goToNextPage}
          pageIndex={pageIndex}
          nextCursor={nextCursor}
          totalPages={totalPages}
        />

        <SprintPanel
          futureSprints={futureSprints}
          activeSprints={activeSprints}
          closedSprints={closedSprints}
          expandedSprints={expandedSprints}
          dragOverSprint={dragOverSprint}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          toggleSprint={toggleSprint}
          sprintTickets={sprintTickets}
          onSelectTicket={setSelectedTicketId}
          onStartSprint={handleStartSprint}
          onCompleteSprint={handleCompleteSprint}
          onCreateSprint={handleCreateSprint}
        />
      </div>

      {/* Modals */}
      <CreateIssueModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        projectId={projectId}
        onIssueCreated={refreshAll}
      />

      <CreateSprintModal
        isOpen={showCreateSprintModal}
        onClose={() => setShowCreateSprintModal(false)}
        projectId={projectId}
        onSprintCreated={refreshAll}
      />

      <StartSprintModal
        isOpen={!!startSprintTarget}
        onClose={() => setStartSprintTarget(null)}
        sprint={startSprintTarget}
        onConfirm={confirmStartSprint}
      />

      {completingSprint && (
        <CompleteSprintModal
          isOpen={!!completingSprint}
          onClose={() => setCompletingSprint(null)}
          sprintName={completingSprint.name}
          targetSprints={sprints.filter(
            (s) =>
              (s.state === SprintState.FUTURE || s.state === SprintState.ACTIVE) &&
              s.id !== completingSprint.id
          )}
          incompleteCount={completingSprint.capacity?.remaining_issues}
          onConfirm={confirmCompleteSprint}
        />
      )}

      {selectedTicketId && (
        <TicketDetailModal
          isOpen={!!selectedTicketId}
          onClose={() => setSelectedTicketId(null)}
          projectId={projectId}
          ticketId={selectedTicketId}
          onTicketUpdated={refreshAll}
        />
      )}

      {/* Bulk action bar (fixed at bottom because the page uses 100vh with overflow:hidden) */}
      {selectedIds.size > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100 }}>
          <BulkActionBar
            selectedCount={selectedIds.size}
            onClear={clearSelection}
            onApply={applyBulkUpdate}
            members={members}
            statuses={statuses}
            selectedTickets={Array.from(selectedIds)
              .map((id) => ticketById.get(id))
              .filter((t): t is BacklogTicket => !!t)
              .map((t) => ({ statusId: t.status_id, preBlockStatusId: t.pre_block_status_id }))}
            labels={labels}
            sprints={sprints}
            epics={epicsList}
            emphasizeSprint
          />
        </div>
      )}
    </div>
  );
}
