'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, ChevronRight, Check, Upload, File, Image, XCircle, Sparkles, TrendingUp, Camera } from 'lucide-react';
import { ticketsAPI, TicketCreateData } from '../lib/api/tickets';
import {
  workflowAPI,
  WorkflowStatus,
  membersAPI,
  ProjectMember,
  labelsAPI,
  Label,
} from '../lib/api/settings';
import { epicsApi, EpicListItem } from '../lib/api/epics';
import { recommendationsAPI, RecommendationResult, skillsAPI, Skill, EmployeeProfile } from '../lib/api/skills';
import { sprintsAPI, Sprint } from '../lib/api/sprints';
import { subtasksAPI } from '../lib/api/subtasks';
import { ButtonCore } from './ui';
import { issueLinksAPI } from '../lib/api/issue-links';
import { ISSUE_TYPE_ICON } from './issue/issueTypeMeta';
import { todayLocal } from '../lib/date';
import { tokens } from '../design-system/tokens';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './ui';
import RichTextEditor from './RichTextEditor';
import { CloneTicketData, FileAttachment, Priority, PriorityValue } from './createIssue/types';
import { ISSUE_TYPES, DISCIPLINE_OPTIONS, PRIORITIES, PARENT_RESULT_LIMIT, PARENT_TYPES, MAX_ATTACHMENT_BYTES } from './createIssue/constants';
import { LabelsField } from './createIssue/LabelsField';
import { PriorityAssigneeRow } from './createIssue/PriorityAssigneeRow';
import { useCreateIssue } from './createIssue/useCreateIssue';
import { ParentIssueSection } from './createIssue/ParentIssueSection';
import { DescriptionField } from './createIssue/DescriptionField';
import { SprintField } from './createIssue/SprintField';
import { RelatedTicketField } from './createIssue/RelatedTicketField';
import { FileAttachmentsField } from './createIssue/FileAttachmentsField';
import { DateRangeRow } from './createIssue/DateRangeRow';

interface CreateIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  onIssueCreated?: () => void;
  defaultStatusId?: number;
  defaultSprintId?: number;
  cloneData?: CloneTicketData;
}


export default function CreateIssueModal({
  isOpen,
  onClose,
  projectId,
  onIssueCreated,
  defaultStatusId,
  defaultSprintId,
  cloneData,
}: CreateIssueModalProps) {
  const {
    acceptAttachments,
    assigneeDropdownRef,
    assigneeId,
    assigneeSearchTerm,
    availableSkills,
    chosenParent,
    creatingNewLabel,
    description,
    detailsSummary,
    dueDate,
    epicDropdownRef,
    epicId,
    epics,
    error,
    fileInputRef,
    files,
    filteredMembers,
    getFileIcon,
    handleCreateLabel,
    handleFileSelect,
    handleSubmit,
    isSubmitting,
    labels,
    labelsDropdownRef,
    loadMoreParents,
    loadingMoreParents,
    loadingParents,
    loadingRecommendations,
    members,
    newLabelColor,
    newLabelName,
    parentCursor,
    parentDropdownRef,
    parentId,
    parentIssues,
    parentSearch,
    parentSearchRef,
    parentTotal,
    priority,
    priorityDropdownRef,
    recommendations,
    relatedDropdownRef,
    relatedTicketId,
    removeFile,
    selectedAssignee,
    selectedDisciplines,
    selectedLabelIds,
    selectedPriority,
    selectedSkillFilters,
    setAssigneeId,
    setAssigneeSearchTerm,
    setChosenParent,
    setCreatingNewLabel,
    setDescription,
    setDueDate,
    setEpicId,
    setFiles,
    setNewLabelColor,
    setNewLabelName,
    setParentId,
    setParentSearch,
    setPriority,
    setRelatedTicketId,
    setSelectedDisciplines,
    setSelectedLabelIds,
    setSelectedSkillFilters,
    setShowAssigneeDropdown,
    setShowEpicDropdown,
    setShowLabelsDropdown,
    setShowMoreDetails,
    setShowParentDropdown,
    setShowPriorityDropdown,
    setShowRecommendations,
    setShowRelatedDropdown,
    setShowSprintDropdown,
    setShowTypeDropdown,
    setSprintId,
    setStartDate,
    setStoryPoints,
    setTitle,
    setType,
    showAssigneeDropdown,
    showEpicDropdown,
    showLabelsDropdown,
    showMoreDetails,
    showParentDropdown,
    showPriorityDropdown,
    showRecommendations,
    showRelatedDropdown,
    showSprintDropdown,
    sprintDropdownRef,
    sprintId,
    sprints,
    startDate,
    storyPoints,
    title,
    type,
  } = useCreateIssue({ isOpen, onClose, projectId, onIssueCreated, defaultStatusId, defaultSprintId, cloneData });

  if (!isOpen) return null;

  return (
    <>
      {/* CSS Animations for paste indicator */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998,
          display: isOpen ? 'block' : 'none',
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
          backgroundColor: '#ffffff',
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: 12,
          padding: 0,
          width: '90%',
          maxWidth: 620,
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9999,
          fontFamily: tokens.fontFamily.sans,
          boxShadow: '0 24px 48px -12px rgba(9,30,66,0.28)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(9,30,66,0.1)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 600,
                color: '#0a0a0a',
                fontFamily: tokens.fontFamily.sans,
              }}
            >
              Create New Issue
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                padding: 6,
                cursor: 'pointer',
                color: '#6b7280',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f3f4f6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Form Content */}
        <div style={{ padding: '24px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* Error Message */}
        {error && (
          <div
            style={{
              marginBottom: tokens.spacing[4],
              padding: tokens.spacing[3],
              backgroundColor: tokens.colors.error[50],
              border: `1px solid ${tokens.colors.error[200]}`,
              borderRadius: tokens.borderRadius.md,
              color: tokens.colors.error[700],
              fontSize: tokens.typography.sizes.sm,
              fontFamily: tokens.fontFamily.sans,
            }}
          >
            {error}
          </div>
        )}

        {/* Issue Type - a segmented control, not a dropdown. Five options, one click,
            and no cramming "Story - User story or feature requirement" into a button
            that then truncates. */}
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: 'block',
              marginBottom: 8,
              fontSize: 14,
              fontWeight: 600,
              color: '#0a0a0a',
              fontFamily: tokens.fontFamily.sans,
            }}
          >
            Issue Type <span style={{ color: '#e00' }}>*</span>
          </label>
          <div
            role="radiogroup"
            aria-label="Issue type"
            style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
          >
            {ISSUE_TYPES.map((t) => {
              const active = type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setType(t.value)}
                  title={t.description}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${active ? '#4C9AFF' : 'rgba(9,30,66,0.14)'}`,
                    background: active ? '#EAF2FF' : '#FFFFFF',
                    color: active ? '#0747A6' : '#42526E',
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                    fontFamily: tokens.fontFamily.sans,
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = '#F4F5F7';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = '#FFFFFF';
                  }}
                >
                  {(() => {
                    const Icon = ISSUE_TYPE_ICON[t.value];
                    return Icon ? <Icon size={14} /> : null;
                  })()}
                  {t.label}
                </button>
              );
            })}
          </div>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 12,
              color: '#8993A4',
              fontFamily: tokens.fontFamily.sans,
            }}
          >
            {ISSUE_TYPES.find((t) => t.value === type)?.description}
          </p>
        </div>


        {/* Title */}
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: 'block',
              marginBottom: 8,
              fontSize: 14,
              fontWeight: 600,
              color: '#0a0a0a',
              fontFamily: tokens.fontFamily.sans,
            }}
          >
            Title <span style={{ color: '#e00' }}>*</span>
          </label>
          <input
            type="text"
            placeholder="Brief description of the issue"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              backgroundColor: 'white',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 8,
              fontSize: 16,
              fontFamily: tokens.fontFamily.sans,
              color: '#0a0a0a',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'all 150ms ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = tokens.colors.primary[500];
              e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[500]}20`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Due Date */}
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: 'block',
              marginBottom: 8,
              fontSize: 14,
              fontWeight: 600,
              color: '#0a0a0a',
              fontFamily: tokens.fontFamily.sans,
            }}
          >
            Due Date <span style={{ color: '#e00' }}>*</span>
          </label>
          <input
            type="date"
            value={dueDate}
            min={startDate || todayLocal()}
            onChange={(e) => setDueDate(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              backgroundColor: 'white',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 8,
              fontSize: 16,
              fontFamily: tokens.fontFamily.sans,
              color: '#0a0a0a',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'all 150ms ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = tokens.colors.primary[500];
              e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[500]}20`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Parent Issue (only for subtasks, never for epics) */}
        {type === 'subtask' && (
          <ParentIssueSection
            parentId={parentId}
            setParentId={setParentId}
            parentIssues={parentIssues}
            parentSearch={parentSearch}
            setParentSearch={setParentSearch}
            loadingParents={loadingParents}
            parentCursor={parentCursor}
            parentTotal={parentTotal}
            loadingMoreParents={loadingMoreParents}
            chosenParent={chosenParent}
            setChosenParent={setChosenParent}
            showParentDropdown={showParentDropdown}
            setShowParentDropdown={setShowParentDropdown}
            parentDropdownRef={parentDropdownRef}
            parentSearchRef={parentSearchRef}
            loadMoreParents={loadMoreParents}
            setShowTypeDropdown={setShowTypeDropdown}
            setShowPriorityDropdown={setShowPriorityDropdown}
            setShowAssigneeDropdown={setShowAssigneeDropdown}
            setShowEpicDropdown={setShowEpicDropdown}
            setShowLabelsDropdown={setShowLabelsDropdown}
            setShowSprintDropdown={setShowSprintDropdown}
          />
        )}

        {/* Priority and Assignee Row */}
        <PriorityAssigneeRow
          type={type}
          priority={priority}
          setPriority={setPriority}
          assigneeId={assigneeId}
          setAssigneeId={setAssigneeId}
          epicId={epicId}
          setEpicId={setEpicId}
          members={members}
          epics={epics}
          labels={labels}
          selectedLabelIds={selectedLabelIds}
          setSelectedLabelIds={setSelectedLabelIds}
          creatingNewLabel={creatingNewLabel}
          setCreatingNewLabel={setCreatingNewLabel}
          newLabelName={newLabelName}
          setNewLabelName={setNewLabelName}
          newLabelColor={newLabelColor}
          setNewLabelColor={setNewLabelColor}
          showPriorityDropdown={showPriorityDropdown}
          setShowPriorityDropdown={setShowPriorityDropdown}
          showAssigneeDropdown={showAssigneeDropdown}
          setShowAssigneeDropdown={setShowAssigneeDropdown}
          showEpicDropdown={showEpicDropdown}
          setShowEpicDropdown={setShowEpicDropdown}
          showLabelsDropdown={showLabelsDropdown}
          setShowLabelsDropdown={setShowLabelsDropdown}
          showRecommendations={showRecommendations}
          setShowRecommendations={setShowRecommendations}
          assigneeSearchTerm={assigneeSearchTerm}
          setAssigneeSearchTerm={setAssigneeSearchTerm}
          recommendations={recommendations}
          loadingRecommendations={loadingRecommendations}
          availableSkills={availableSkills}
          selectedSkillFilters={selectedSkillFilters}
          setSelectedSkillFilters={setSelectedSkillFilters}
          priorityDropdownRef={priorityDropdownRef}
          assigneeDropdownRef={assigneeDropdownRef}
          epicDropdownRef={epicDropdownRef}
          labelsDropdownRef={labelsDropdownRef}
          handleCreateLabel={handleCreateLabel}
          setShowTypeDropdown={setShowTypeDropdown}
          setShowParentDropdown={setShowParentDropdown}
          setShowSprintDropdown={setShowSprintDropdown}
          selectedPriority={selectedPriority}
          selectedAssignee={selectedAssignee}
          filteredMembers={filteredMembers}
        />

        {/* Description */}
        <DescriptionField
          description={description}
          setDescription={setDescription}
          files={files}
          removeFile={removeFile}
          projectId={projectId}
          type={type}
        />

        {/* Sprint Selection - Hidden for Epics */}
        {type !== 'epic' && (
          <SprintField
            sprintId={sprintId}
            setSprintId={setSprintId}
            sprints={sprints}
            showSprintDropdown={showSprintDropdown}
            setShowSprintDropdown={setShowSprintDropdown}
            sprintDropdownRef={sprintDropdownRef}
            setShowTypeDropdown={setShowTypeDropdown}
            setShowPriorityDropdown={setShowPriorityDropdown}
            setShowAssigneeDropdown={setShowAssigneeDropdown}
            setShowEpicDropdown={setShowEpicDropdown}
            setShowLabelsDropdown={setShowLabelsDropdown}
            setShowParentDropdown={setShowParentDropdown}
          />
        )}

        {/* Related Ticket (only for bugs) */}
        {type === 'bug' && (
          <RelatedTicketField
            relatedTicketId={relatedTicketId}
            setRelatedTicketId={setRelatedTicketId}
            parentIssues={parentIssues}
            showRelatedDropdown={showRelatedDropdown}
            setShowRelatedDropdown={setShowRelatedDropdown}
            relatedDropdownRef={relatedDropdownRef}
            setShowTypeDropdown={setShowTypeDropdown}
            setShowPriorityDropdown={setShowPriorityDropdown}
            setShowAssigneeDropdown={setShowAssigneeDropdown}
            setShowEpicDropdown={setShowEpicDropdown}
            setShowLabelsDropdown={setShowLabelsDropdown}
            setShowParentDropdown={setShowParentDropdown}
            setShowSprintDropdown={setShowSprintDropdown}
          />
        )}

        {/* Discipline subtasks (only for stories) */}
        {type === 'story' && (
          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: 'block',
                marginBottom: 8,
                fontSize: 14,
                fontWeight: 600,
                color: '#0a0a0a',
                fontFamily: tokens.fontFamily.sans,
              }}
            >
              Create Linked Tickets
            </label>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              {DISCIPLINE_OPTIONS.map((discipline) => {
                const isChecked = selectedDisciplines.includes(discipline.value);
                return (
                  <label
                    key={discipline.value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      backgroundColor: isChecked ? `${tokens.colors.primary[500]}10` : 'white',
                      border: `1px solid ${isChecked ? tokens.colors.primary[500] : 'rgba(0,0,0,0.1)'}`,
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 500,
                      fontFamily: tokens.fontFamily.sans,
                      color: '#0a0a0a',
                      userSelect: 'none',
                      transition: 'all 150ms ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isChecked) {
                        e.currentTarget.style.backgroundColor = 'rgba(248,250,252,0.8)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isChecked) {
                        e.currentTarget.style.backgroundColor = 'white';
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        setSelectedDisciplines((prev) =>
                          prev.includes(discipline.value)
                            ? prev.filter((v) => v !== discipline.value)
                            : [...prev, discipline.value]
                        );
                      }}
                      style={{
                        width: 16,
                        height: 16,
                        accentColor: tokens.colors.primary[500],
                        cursor: 'pointer',
                      }}
                    />
                    {discipline.label}
                  </label>
                );
              })}
            </div>
            {selectedDisciplines.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  color: tokens.colors.neutral[500],
                  fontFamily: tokens.fontFamily.sans,
                }}
              >
                {selectedDisciplines.length} subtask{selectedDisciplines.length > 1 ? 's' : ''} will be created and linked to this story
              </div>
            )}
          </div>
        )}


        {/* Progressive disclosure: the fields most tickets never set are one click away
            rather than padding out the form. Required and type-specific fields stay above. */}
        <div style={{ marginBottom: showMoreDetails ? 16 : 24 }}>
          <button
            type="button"
            onClick={() => setShowMoreDetails((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              border: 'none',
              padding: '6px 0',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: '#42526E',
              fontFamily: tokens.fontFamily.sans,
            }}
          >
            {showMoreDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            More details
            {!showMoreDetails && detailsSummary && (
              <span style={{ fontWeight: 400, color: '#8993A4' }}>· {detailsSummary}</span>
            )}
          </button>
        </div>

        {showMoreDetails && (
          <>

        {/* Date Range Row - Story Points hidden for Epics */}
        <DateRangeRow
          startDate={startDate}
          setStartDate={setStartDate}
          storyPoints={storyPoints}
          setStoryPoints={setStoryPoints}
          type={type}
        />

        {/* File Attachments */}
        <FileAttachmentsField
          files={files}
          setFiles={setFiles}
          fileInputRef={fileInputRef}
          acceptAttachments={acceptAttachments}
          handleFileSelect={handleFileSelect}
          removeFile={removeFile}
          getFileIcon={getFileIcon}
        />

          </>
        )}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          position: 'sticky',
          bottom: -24,
          margin: '24px -24px -24px',
          padding: '16px 24px',
          background: '#FFFFFF',
          borderTop: '1px solid rgba(9,30,66,0.1)',
        }}>
          {/* A disabled Create button with no reason is a dead end - say what's missing. */}
          {(!title.trim() || (!dueDate && type !== 'epic')) && !isSubmitting && (
            <span
              style={{
                marginRight: 'auto',
                alignSelf: 'center',
                fontSize: 12,
                color: '#8993A4',
                fontFamily: tokens.fontFamily.sans,
              }}
            >
              {!title.trim() ? 'Add a title to continue' : 'Add a due date to continue'}
            </span>
          )}
          <ButtonCore
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </ButtonCore>
          <div style={{ position: 'relative' }}>
            <ButtonCore
              variant="primary"
              onClick={handleSubmit}
              disabled={!title.trim() || (!dueDate && type !== 'epic')}
              loading={isSubmitting}
              title={
                isSubmitting
                  ? 'Creating issue...'
                  : !title.trim()
                  ? 'Title is required'
                  : !dueDate && type !== 'epic'
                  ? 'Due date is required'
                  : ''
              }
            >
              {isSubmitting ? 'Creating...' : 'Create Issue'}
            </ButtonCore>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
