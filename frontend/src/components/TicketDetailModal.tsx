'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, File, XCircle, Download, MessageSquare, Paperclip, ChevronDown, Check, Calendar, User, Tag, AlertCircle, Copy, Clock, Eye, Plus, Archive, ArchiveRestore, Trash2, MoreHorizontal, ExternalLink, Camera, Link as LinkIcon } from 'lucide-react';
import { ticketsAPI, Ticket, TicketFile, TicketComment, TicketUpdateData, TicketHistory, TicketDeleteImpact } from '../lib/api/tickets';
import { tokens } from '../design-system/tokens';
import { priorityColor, priorityLabel, PRIORITIES, type Priority } from '../lib/priority';
import { todayLocal } from '../lib/date';
import { sanitizeHtml } from '../lib/sanitize';
import TicketComments from './TicketComments';
import { Select, ButtonCore } from './ui';
import { Avatar } from '../design-system/components';
import { useAuth } from '../hooks/useAuth';
import { workflowAPI, WorkflowStatus, membersAPI, ProjectMember, labelsAPI, Label } from '../lib/api/settings';
import { epicsApi, EpicListItem } from '../lib/api/epics';
import { sprintsAPI, Sprint } from '../lib/api/sprints';
import RichTextEditor from './RichTextEditor';
import { ConfirmDialog, useToast } from './ui';
import CreateIssueModal from './CreateIssueModal';
import DoneEvidenceModal, { EVIDENCE_REQUIRED_STATUS_NAMES } from './DoneEvidenceModal';
import IssueHierarchyBreadcrumb from './issue/IssueHierarchyBreadcrumb';
import SubtaskList from './issue/SubtaskList';
import IssueLinkList from './issue/IssueLinkList';
import TimeTrackingBar from './time/TimeTrackingBar';
import WorklogModal from './time/WorklogModal';
import { issueLinksAPI, IssueLinkGrouped } from '../lib/api/issue-links';
import { Worklog } from './time/WorklogList';
import { canMoveTo, transitionBlockReason } from '../lib/statusFlow';

// Backend origin, with a localhost fallback so direct fetch() calls don't resolve
// to `undefined/...` when NEXT_PUBLIC_API_URL isn't set (e.g. local dev).
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface TicketDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  ticketId: number;
  onTicketUpdated?: () => void;
  nestingLevel?: number;
}

import { FileAttachment } from './ticketDetail/types';
import { getFileVisual, normalizeUrl, isValidHttpUrl, readValueStyle, readEmptyStyle } from './ticketDetail/utils';
import { DetailRow } from './ticketDetail/DetailRow';
import { LabelPicker } from './ticketDetail/LabelPicker';
import { ActivityTabs } from './ticketDetail/ActivityTabs';
import { StatusPipeline } from './ticketDetail/StatusPipeline';
import { DescriptionSection } from './ticketDetail/DescriptionSection';
import { AttachmentsSection } from './ticketDetail/AttachmentsSection';
import { DetailsRail } from './ticketDetail/DetailsRail';
import { StickyHeader } from './ticketDetail/StickyHeader';
import { IssueLinksSection } from './ticketDetail/IssueLinksSection';
import { useTicketDetail } from './ticketDetail/useTicketDetail';

export default function TicketDetailModal({
  isOpen,
  onClose,
  projectId,
  ticketId,
  onTicketUpdated,
  nestingLevel = 0,
}: TicketDetailModalProps) {
  const {
    history,
    activeTab,
    authLoading,
    canDelete,
    currentStatusColor,
    deleteImpact,
    deleting,
    editAssigneeId,
    editDescription,
    editDueDate,
    editEpicId,
    editLabelIds,
    editMergeRequestUrl,
    editPriority,
    editSprintId,
    editStatusId,
    editTitle,
    editingDescription,
    epics,
    error,
    fileInputRef,
    files,
    handleAddLink,
    handleDelete,
    handleDeleteFile,
    handleFileSelect,
    handleLinkSearch,
    handleLogWork,
    handleNavigateToIssue,
    handlePriorityChange,
    handleRemoveLink,
    handleSave,
    handleStatusChange,
    handleToggleArchive,
    hasChanges,
    hasDeleteImpact,
    isAdmin,
    isMember,
    issueLinks,
    labels,
    linkSearchLoading,
    linkSearchQuery,
    linkSearchResults,
    loadTicketData,
    loading,
    members,
    moreMenuRef,
    mrError,
    newLinkType,
    openDeleteConfirm,
    parentTicket,
    pendingDoneStatusId,
    performStatusChange,
    priorityButtonRef,
    priorityDropdownRef,
    priorityMenuPos,
    priorityMenuRef,
    saveFieldDirectly,
    saving,
    selectedLinkTarget,
    selectedSubtaskId,
    setActiveTab,
    setEditAssigneeId,
    setEditDescription,
    setEditDueDate,
    setEditEpicId,
    setEditLabelIds,
    setEditMergeRequestUrl,
    setEditSprintId,
    setEditTitle,
    setEditingDescription,
    setLinkSearchQuery,
    setLinkSearchResults,
    setMrError,
    setNewLinkType,
    setPendingDoneStatusId,
    setPriorityMenuPos,
    setSelectedLinkTarget,
    setSelectedSubtaskId,
    setShowAddLinkModal,
    setShowAssigneeDropdown,
    setShowCloneModal,
    setShowDeleteConfirm,
    setShowEpicDropdown,
    setShowLabelsDropdown,
    setShowMoreMenu,
    setShowPriorityDropdown,
    setShowSprintDropdown,
    setShowStatusDropdown,
    setShowWorklogModal,
    setStatusMenuPos,
    setSubtaskRefreshKey,
    showAddLinkModal,
    showCloneModal,
    showDeleteConfirm,
    showMoreMenu,
    showPriorityDropdown,
    showStatusDropdown,
    showWorklogModal,
    sprints,
    statusButtonRef,
    statusDropdownRef,
    statusMenuPos,
    statusMenuRef,
    statuses,
    subtaskRefreshKey,
    ticket,
    toast,
    uploading,
    uploadingScreenshot,
    user,
  } = useTicketDetail({ isOpen, onClose, projectId, ticketId, onTicketUpdated, nestingLevel });

  if (!isOpen) return null;

  return (
    <>
      {/* Spinner animation */}
      <style>
        {`
          /* Details-rail cells: plain text until you point at them. */
          .td-ghost { border: 1px solid transparent; background: transparent; }
          .td-ghost:hover:not(:disabled) { border-color: #DFE1E6; background: #FFFFFF; }
          .td-ghost:focus-visible { outline: 2px solid #4C9AFF; outline-offset: 1px; }
          .td-prose:hover { background: #F4F5F7; }
          .td-prose p:first-child { margin-top: 0; }
          .td-prose p:last-child { margin-bottom: 0; }

          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>

      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998 + (nestingLevel * 10),
          backdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          borderRadius: 12,
          // Clip children (notably the sticky white header) to the rounded corners -
          // without this the header's square top corners paint over the radius.
          overflow: 'hidden',
          width: '90vw',
          maxWidth: 1200,
          height: '90vh',
          zIndex: 9999 + (nestingLevel * 10),
          fontFamily: tokens.fontFamily.sans,
          boxShadow: tokens.shadows['2xl'],
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading || authLoading ? (
          <div style={{ padding: 48, textAlign: 'center', color: tokens.colors.neutral[500] }}>
            Loading ticket details...
          </div>
        ) : error && !ticket ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            {/* A shared/deep link can land on a ticket that was deleted or that the
                viewer can't access. Show the server's actual reason (e.g. "Ticket not
                found") rather than guessing; only fall back to a generic line when the
                error is a bare technical string with no useful detail. */}
            <div style={{ fontSize: 16, fontWeight: 600, color: tokens.colors.neutral[800], marginBottom: 8 }}>
              Couldn&apos;t open this ticket
            </div>
            <div style={{ color: tokens.colors.neutral[600], marginBottom: 16 }}>
              {error && !/^HTTP \d+$/.test(error)
                ? error
                : 'It may have been deleted, or you may not have access to it.'}
            </div>
            <ButtonCore variant="primary" onClick={onClose}>
              Close
            </ButtonCore>
          </div>
        ) : ticket ? (
          <>
            {/* Sticky Header */}
              <StickyHeader
                ticket={ticket}
                projectId={projectId}
                ticketId={ticketId}
                onClose={onClose}
                isAdmin={isAdmin}
                isMember={isMember}
                user={user}
                saving={saving}
                statuses={statuses}
                epics={epics}
                editStatusId={editStatusId}
                editPriority={editPriority}
                parentTicket={parentTicket}
                currentStatusColor={currentStatusColor}
                canDelete={canDelete}
                hasChanges={hasChanges}
                showStatusDropdown={showStatusDropdown}
                setShowStatusDropdown={setShowStatusDropdown}
                showPriorityDropdown={showPriorityDropdown}
                setShowPriorityDropdown={setShowPriorityDropdown}
                showMoreMenu={showMoreMenu}
                setShowMoreMenu={setShowMoreMenu}
                setShowAssigneeDropdown={setShowAssigneeDropdown}
                setShowLabelsDropdown={setShowLabelsDropdown}
                setShowEpicDropdown={setShowEpicDropdown}
                setShowSprintDropdown={setShowSprintDropdown}
                setShowCloneModal={setShowCloneModal}
                statusMenuPos={statusMenuPos}
                setStatusMenuPos={setStatusMenuPos}
                priorityMenuPos={priorityMenuPos}
                setPriorityMenuPos={setPriorityMenuPos}
                statusButtonRef={statusButtonRef}
                statusDropdownRef={statusDropdownRef}
                statusMenuRef={statusMenuRef}
                priorityButtonRef={priorityButtonRef}
                priorityDropdownRef={priorityDropdownRef}
                priorityMenuRef={priorityMenuRef}
                moreMenuRef={moreMenuRef}
                handleStatusChange={handleStatusChange}
                handlePriorityChange={handlePriorityChange}
                handleSave={handleSave}
                handleToggleArchive={handleToggleArchive}
                openDeleteConfirm={openDeleteConfirm}
                handleNavigateToIssue={handleNavigateToIssue}
                loadTicketData={loadTicketData}
              />

            {/* Main content - Two column layout */}
            <div
              style={{
                display: 'flex',
                flex: 1,
                overflow: 'hidden',
              }}
            >
              {/* Left column - Main content (65%) */}
              <div
                style={{
                  flex: '0 0 65%',
                  overflowY: 'auto',
                  padding: '32px',
                  borderRight: `1px solid ${tokens.colors.neutral[200]}`,
                }}
              >
                {/* Title - Large and prominent */}
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  disabled={!isAdmin && !isMember}
                  style={{
                    width: '100%',
                    border: 'none',
                    outline: 'none',
                    fontSize: 24,
                    fontWeight: 650,
                    lineHeight: 1.25,
                    color: tokens.colors.neutral[900],
                    background: 'transparent',
                    marginBottom: 14,
                    padding: '12px 0',
                    letterSpacing: '-0.02em',
                    cursor: isAdmin || isMember ? 'text' : 'default',
                  }}
                  placeholder="Issue title"
                  onFocus={(e) => {
                    if (isAdmin || isMember) {
                      e.target.style.backgroundColor = tokens.colors.neutral[50];
                      e.target.style.padding = '12px';
                      e.target.style.borderRadius = '6px';
                    }
                  }}
                  onBlur={(e) => {
                    handleSave();
                    e.target.style.backgroundColor = 'transparent';
                    e.target.style.padding = '12px 0';
                  }}
                />

                {/* Status as a visible pipeline rather than a dropdown. The whole
                    workflow is on screen, the current step is obvious, and moving the
                    issue is one click on the step you want — no menu to open first. */}
                <StatusPipeline
                  statuses={statuses}
                  editStatusId={editStatusId}
                  ticket={ticket}
                  isAdmin={isAdmin}
                  isMember={isMember}
                  saving={saving}
                  handleStatusChange={handleStatusChange}
                />

                {/* Description — reads as prose until you click into it. A permanently
                    open editor with a visible toolbar made every issue look like a form. */}
                <DescriptionSection
                  projectId={projectId}
                  editDescription={editDescription}
                  setEditDescription={setEditDescription}
                  editingDescription={editingDescription}
                  setEditingDescription={setEditingDescription}
                  isAdmin={isAdmin}
                  isMember={isMember}
                />

                {/* Attachments */}
                <AttachmentsSection
                  files={files}
                  projectId={projectId}
                  ticketId={ticketId}
                  isAdmin={isAdmin}
                  isMember={isMember}
                  uploading={uploading}
                  uploadingScreenshot={uploadingScreenshot}
                  fileInputRef={fileInputRef}
                  handleFileSelect={handleFileSelect}
                  handleDeleteFile={handleDeleteFile}
                />

                {/* Subtasks */}
                {ticket.type !== 'subtask' && (
                  <div style={{ marginBottom: 32 }}>
                    <SubtaskList
                      projectId={projectId}
                      parentIssueId={ticketId}
                      canEdit={isAdmin || isMember}
                      onSubtaskClick={handleNavigateToIssue}
                      refreshKey={subtaskRefreshKey}
                    />
                  </div>
                )}

                {/* Issue Links */}
                <IssueLinksSection
                  issueLinks={issueLinks}
                  isAdmin={isAdmin}
                  isMember={isMember}
                  showAddLinkModal={showAddLinkModal}
                  setShowAddLinkModal={setShowAddLinkModal}
                  linkSearchQuery={linkSearchQuery}
                  setLinkSearchQuery={setLinkSearchQuery}
                  linkSearchResults={linkSearchResults}
                  setLinkSearchResults={setLinkSearchResults}
                  linkSearchLoading={linkSearchLoading}
                  newLinkType={newLinkType}
                  setNewLinkType={setNewLinkType}
                  selectedLinkTarget={selectedLinkTarget}
                  setSelectedLinkTarget={setSelectedLinkTarget}
                  handleLinkSearch={handleLinkSearch}
                  handleAddLink={handleAddLink}
                  handleRemoveLink={handleRemoveLink}
                  handleNavigateToIssue={handleNavigateToIssue}
                />

                {/* Activity Tabs */}
                <ActivityTabs
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  projectId={projectId}
                  ticketId={ticketId}
                  history={history}
                />
              </div>

              {/* Right column - Metadata sidebar (35%) */}
                <DetailsRail
                  ticket={ticket}
                  projectId={projectId}
                  ticketId={ticketId}
                  isAdmin={isAdmin}
                  isMember={isMember}
                  user={user}
                  members={members}
                  labels={labels}
                  epics={epics}
                  sprints={sprints}
                  editAssigneeId={editAssigneeId}
                  setEditAssigneeId={setEditAssigneeId}
                  editLabelIds={editLabelIds}
                  setEditLabelIds={setEditLabelIds}
                  editEpicId={editEpicId}
                  setEditEpicId={setEditEpicId}
                  editSprintId={editSprintId}
                  setEditSprintId={setEditSprintId}
                  editDueDate={editDueDate}
                  setEditDueDate={setEditDueDate}
                  editMergeRequestUrl={editMergeRequestUrl}
                  setEditMergeRequestUrl={setEditMergeRequestUrl}
                  mrError={mrError}
                  setMrError={setMrError}
                  loadTicketData={loadTicketData}
                  saveFieldDirectly={saveFieldDirectly}
                />
            </div>
          </>
        ) : null}
      </div>

      {/* Delete confirmation - names exactly what will be destroyed */}
      {ticket && (
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title={`Delete ${ticket.key}?`}
          destructive
          busy={deleting}
          confirmLabel={deleting ? 'Deleting...' : 'Delete permanently'}
          confirmIcon={<Trash2 size={14} />}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        >
          <p style={{ margin: '0 0 12px' }}>
            This permanently deletes the issue and everything on it. This cannot be undone.
          </p>

          {deleteImpact && (hasDeleteImpact ? (
            <div
              style={{
                backgroundColor: tokens.colors.error[50],
                border: `1px solid ${tokens.colors.error[200]}`,
                borderRadius: 6,
                padding: '10px 12px',
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: tokens.colors.error[700], marginBottom: 6 }}>
                This will also delete:
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: tokens.colors.error[700], lineHeight: 1.6 }}>
                {deleteImpact.subtasks > 0 && (
                  <li>
                    <strong>{deleteImpact.subtasks}</strong> subtask{deleteImpact.subtasks === 1 ? '' : 's'}
                  </li>
                )}
                {deleteImpact.comments > 0 && (
                  <li>{deleteImpact.comments} comment{deleteImpact.comments === 1 ? '' : 's'}</li>
                )}
                {deleteImpact.attachments > 0 && (
                  <li>{deleteImpact.attachments} attachment{deleteImpact.attachments === 1 ? '' : 's'}</li>
                )}
                {deleteImpact.worklogs > 0 && (
                  <li>
                    {deleteImpact.worklogs} worklog{deleteImpact.worklogs === 1 ? '' : 's'}
                    {deleteImpact.time_spent_seconds > 0 &&
                      ` (${(deleteImpact.time_spent_seconds / 3600).toFixed(1)}h logged)`}
                  </li>
                )}
              </ul>
            </div>
          ) : (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: tokens.colors.neutral[500] }}>
              Nothing else is attached to this issue.
            </p>
          ))}

          <p style={{ margin: 0, fontSize: 13, color: tokens.colors.neutral[500] }}>
            To keep it but hide it from the board, use <strong>Archive</strong> instead.
          </p>
        </ConfirmDialog>
      )}

      {/* Clone Modal */}
      {ticket && (
        <CreateIssueModal
          isOpen={showCloneModal}
          onClose={() => setShowCloneModal(false)}
          projectId={projectId}
          onIssueCreated={() => {
            setShowCloneModal(false);
            onTicketUpdated?.();
          }}
          cloneData={{
            title: ticket.title,
            description: ticket.description || '',
            type: ticket.type,
            priority: ticket.priority as Priority | undefined,
            assigneeId: ticket.assignee?.id || null,
            epicId: ticket.epic_id || null,
            labelIds: editLabelIds.length > 0 ? editLabelIds : undefined,
            dueDate: editDueDate || undefined,
          }}
        />
      )}

      {/* Worklog Modal */}
      {ticket && (
        <WorklogModal
          isOpen={showWorklogModal}
          onClose={() => setShowWorklogModal(false)}
          onSubmit={handleLogWork}
          issueKey={ticket.key}
        />
      )}

      {/* Nested Subtask/Issue Modal */}
      {selectedSubtaskId !== null && (
        <TicketDetailModal
          isOpen={true}
          onClose={() => {
            setSelectedSubtaskId(null);
            loadTicketData({ silent: true }); // Reload the parent ticket to reflect any changes
            setSubtaskRefreshKey((k) => k + 1); // Re-fetch the subtask list so edits (status, name, …) show
          }}
          projectId={projectId}
          ticketId={selectedSubtaskId}
          onTicketUpdated={() => {
            loadTicketData({ silent: true }); // Reload the parent ticket when subtask is updated
            setSubtaskRefreshKey((k) => k + 1); // Keep the subtask list in sync with the nested modal
          }}
          nestingLevel={nestingLevel + 1}
        />
      )}

      {/* Require a merge request link or comment before this ticket enters an
          evidence-required status (In Review, Testing, Done, …). */}
      {pendingDoneStatusId !== null && ticket && (
        <DoneEvidenceModal
          isOpen={true}
          ticketKey={ticket.key}
          targetStatusName={statuses.find((s) => s.id === pendingDoneStatusId)?.name}
          initialMergeRequestUrl={editMergeRequestUrl || ticket.merge_request_url || ''}
          onClose={() => setPendingDoneStatusId(null)}
          onSubmit={async ({ mergeRequestUrl, comment }) => {
            if (pendingDoneStatusId === null) return;
            try {
              await performStatusChange(pendingDoneStatusId, { mergeRequestUrl, comment });
              setPendingDoneStatusId(null);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Failed to update status');
              throw err; // keep the modal open so the user can retry
            }
          }}
        />
      )}
    </>
  );
}
