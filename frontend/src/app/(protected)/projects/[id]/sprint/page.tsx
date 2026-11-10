'use client';

import React from 'react';
import { PRIORITY_OPTIONS } from '@/lib/priority';
import { tokens } from '../../../../../design-system/tokens';
import CreateIssueModal from '../../../../../components/CreateIssueModal';
import TicketDetailModal from '../../../../../components/TicketDetailModal';
import CompleteSprintModal from '../../../../../components/CompleteSprintModal';
import EditSprintEndDateModal from '../../../../../components/EditSprintEndDateModal';
import DoneEvidenceModal from '../../../../../components/DoneEvidenceModal';
import { BoardColumn } from '../../../../../components/board/BoardColumn';
import { BoardToolbar } from '../../../../../components/board/BoardToolbar';
import { COLORS, SPRINT_TYPE_OPTIONS } from './constants';
import { IssueCard, GroupBy } from './types';
import { SprintHeader } from './SprintHeader';
import { NoActiveSprint } from './NoActiveSprint';
import { useSprintPage } from './useSprintPage';

export default function SprintPage() {
  const s = useSprintPage();

  // Loading state
  if (s.loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontFamily: tokens.fontFamily.sans,
          background: COLORS.background,
        }}
      >
        <div style={{ fontSize: 14, color: COLORS.textSecondary }}>Loading sprint board...</div>
      </div>
    );
  }

  // Error state
  if (s.error) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontFamily: tokens.fontFamily.sans,
          background: COLORS.background,
        }}
      >
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.error, marginBottom: 8 }}>Error</div>
          <div style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 16 }}>{s.error}</div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: COLORS.primary,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 3,
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // No active sprint state
  if (!s.activeSprint) {
    return (
      <NoActiveSprint
        projectId={s.projectId}
        futureSprints={s.futureSprints}
        showCreateModal={s.showCreateModal}
        startSprintTarget={s.startSprintTarget}
        onOpenCreate={() => s.setShowCreateModal(true)}
        onCloseCreate={() => s.setShowCreateModal(false)}
        onSprintCreated={s.fetchData}
        onStartSprint={s.handleStartSprint}
        onCancelStartSprint={() => s.setStartSprintTarget(null)}
        onConfirmStartSprint={s.confirmStartSprint}
      />
    );
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.background,
        fontFamily: tokens.fontFamily.sans,
        overflow: 'hidden',
      }}
    >
      {/* Sprint Header */}
      <SprintHeader
        sprint={s.activeSprint}
        activeSprints={s.activeSprints}
        onSwitchSprint={s.handleSwitchSprint}
        capacity={s.capacity}
        projectId={s.projectId}
        onCompleteSprint={s.handleCompleteSprint}
        canEditDates={s.canEditDates}
        onEditEndDate={() => s.setEditEndDateOpen(true)}
        onSprintGoalUpdate={s.updateSprintGoal}
      />

      {/* Toolbar - shared with the board page. The sprint name lives in SprintHeader
          above, so the toolbar's editable-name block is hidden (showName={false}).
          Label/Sprint/Archived filters are board-only and stay off here by omitting
          their callbacks. */}
      <BoardToolbar
        showName={false}
        searchQuery={s.searchQuery}
        onSearchChange={s.setSearchQuery}
        assigneeFilter={s.assigneeFilter}
        onAssigneeFilterChange={s.setAssigneeFilter}
        assignees={s.members.map((m) => ({ id: m.user_id, name: m.name }))}
        typeFilter={s.typeFilter}
        onTypeFilterChange={(v) => s.setTypeFilter(v as IssueCard['type'] | 'all')}
        types={SPRINT_TYPE_OPTIONS}
        epicFilter={s.epicFilter}
        onEpicFilterChange={(v) => s.setEpicFilter(v as number | 'all')}
        epics={s.epics.map((e) => ({ id: e.epicId ?? e.id, name: e.epicName || e.title }))}
        priorityFilter={s.priorityFilter ?? 'all'}
        onPriorityFilterChange={(v) => s.setPriorityFilter(v as IssueCard['priority'] | 'all')}
        priorities={PRIORITY_OPTIONS.map((o) => ({ id: o.value, name: o.label }))}
        groupBy={s.groupBy}
        onGroupByChange={(v) => s.setGroupBy(v as GroupBy)}
      />

      {/* Kanban Board */}
      <div
        style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          padding: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 16,
            height: '100%',
            alignItems: 'flex-start',
          }}
        >
          {s.statuses.map((status) => (
            <BoardColumn
              key={status.id}
              id={status.id}
              name={status.name}
              color={status.color}
              issues={s.issuesByStatus[status.id] || []}
              onAddIssue={() => s.handleAddIssue(status.id)}
              onIssueClick={s.setSelectedIssueId}
              onDragStart={s.handleDragStart}
              onDragEnd={s.handleDragEnd}
              onDragOver={s.handleDragOver}
              onDragLeave={s.handleDragLeave}
              onDrop={s.handleDrop}
              draggedIssue={s.draggedIssue}
              isDraggingOver={s.dragOverStatusId === status.id}
              dropBlocked={s.isDropBlocked(status.id)}
              collapsed={s.collapsedColumns.has(String(status.id))}
              onToggleCollapse={() => s.toggleColumnCollapsed(status.id)}
            />
          ))}
        </div>
      </div>

      {/* Modals */}
      <EditSprintEndDateModal
        isOpen={s.editEndDateOpen}
        onClose={() => s.setEditEndDateOpen(false)}
        sprint={s.activeSprint}
        onConfirm={s.confirmEditEndDate}
      />

      {/* Ask for a merge request link or comment before a card enters an
          evidence-required status (In Review, Testing, Done, …). */}
      {s.doneEvidenceCtx && (
        <DoneEvidenceModal
          isOpen={true}
          ticketKey={s.doneEvidenceCtx.ticketKey}
          targetStatusName={s.statuses.find((st) => st.id === s.doneEvidenceCtx!.targetStatusId)?.name}
          onClose={() => s.setDoneEvidenceCtx(null)}
          onSubmit={s.submitDoneEvidence}
        />
      )}

      <CreateIssueModal
        isOpen={s.showCreateModal}
        onClose={() => {
          s.setShowCreateModal(false);
          s.setSelectedStatusId(null);
        }}
        projectId={s.projectId}
        defaultStatusId={s.selectedStatusId || undefined}
        defaultSprintId={s.activeSprint?.id}
        onIssueCreated={s.handleIssueCreated}
      />

      {s.selectedIssueId && (
        <TicketDetailModal
          isOpen={!!s.selectedIssueId}
          onClose={() => s.setSelectedIssueId(null)}
          projectId={s.projectId}
          ticketId={s.selectedIssueId}
          onTicketUpdated={s.handleIssueCreated}
        />
      )}

      {s.activeSprint && (
        <CompleteSprintModal
          isOpen={s.showCompleteSprintModal}
          onClose={() => s.setShowCompleteSprintModal(false)}
          sprintName={s.activeSprint.name}
          targetSprints={[
            ...s.activeSprints.filter((sp) => sp.id !== s.activeSprint!.id),
            ...s.futureSprints,
          ]}
          incompleteCount={s.capacity?.remaining_issues}
          onConfirm={s.confirmCompleteSprint}
        />
      )}
    </div>
  );
}
