'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, File, XCircle, Download, MessageSquare, Paperclip, ChevronDown, Check, Calendar, User, Tag, AlertCircle, Copy, Clock, Eye, Plus, Archive, ArchiveRestore, Trash2, MoreHorizontal, ExternalLink, Camera, Link as LinkIcon } from 'lucide-react';
import { ticketsAPI, Ticket, TicketFile, TicketComment, TicketUpdateData, TicketHistory, TicketDeleteImpact } from '../../lib/api/tickets';
import { tokens } from '../../design-system/tokens';
import { priorityColor, priorityLabel, PRIORITIES, type Priority } from '../../lib/priority';
import { todayLocal } from '../../lib/date';
import { sanitizeHtml } from '../../lib/sanitize';
import TicketComments from '../TicketComments';
import { Select, ButtonCore } from '../ui';
import { Avatar } from '../../design-system/components';
import { useAuth } from '../../hooks/useAuth';
import { workflowAPI, WorkflowStatus, membersAPI, ProjectMember, labelsAPI, Label } from '../../lib/api/settings';
import { epicsApi, EpicListItem } from '../../lib/api/epics';
import { sprintsAPI, Sprint } from '../../lib/api/sprints';
import RichTextEditor from '../RichTextEditor';
import { ConfirmDialog, useToast } from '../ui';
import CreateIssueModal from '../CreateIssueModal';
import DoneEvidenceModal, { EVIDENCE_REQUIRED_STATUS_NAMES } from '../DoneEvidenceModal';
import IssueHierarchyBreadcrumb from '../issue/IssueHierarchyBreadcrumb';
import SubtaskList from '../issue/SubtaskList';
import IssueLinkList from '../issue/IssueLinkList';
import TimeTrackingBar from '../time/TimeTrackingBar';
import WorklogModal from '../time/WorklogModal';
import { issueLinksAPI, IssueLinkGrouped } from '../../lib/api/issue-links';
import { Worklog } from '../time/WorklogList';
import { canMoveTo, transitionBlockReason } from '../../lib/statusFlow';

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

import { FileAttachment } from './types';
import { getFileVisual, normalizeUrl, isValidHttpUrl, readValueStyle, readEmptyStyle } from './utils';
import { DetailRow } from './DetailRow';
import { LabelPicker } from './LabelPicker';
import { ActivityTabs } from './ActivityTabs';
import { StatusPipeline } from './StatusPipeline';
import { DescriptionSection } from './DescriptionSection';
import { AttachmentsSection } from './AttachmentsSection';
import { DetailsRail } from './DetailsRail';
import { StickyHeader } from './StickyHeader';
import { IssueLinksSection } from './IssueLinksSection';

export interface UseTicketDetailParams {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  ticketId: number;
  onTicketUpdated?: () => void;
  nestingLevel?: number;
}

export function useTicketDetail({
  isOpen, onClose, projectId, ticketId, onTicketUpdated, nestingLevel = 0,
}: UseTicketDetailParams) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [files, setFiles] = useState<TicketFile[]>([]);
  const [newFiles, setNewFiles] = useState<FileAttachment[]>([]);
  const [history, setHistory] = useState<TicketHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // For editing fields
  const { user, isAdmin, isMember, loading: authLoading } = useAuth();
  const toast = useToast();
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [epics, setEpics] = useState<EpicListItem[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<Priority | undefined>(undefined);
  const [editAssigneeId, setEditAssigneeId] = useState<number | null>(null);
  const [editStatusId, setEditStatusId] = useState<number | null>(null);
  const [editLabelIds, setEditLabelIds] = useState<number[]>([]);
  const [editEpicId, setEditEpicId] = useState<number | null>(null);
  const [editSprintId, setEditSprintId] = useState<number | null>(null);
  const [editDueDate, setEditDueDate] = useState<string>('');
  const [editMergeRequestUrl, setEditMergeRequestUrl] = useState<string>('');
  // Inline validation message for the merge-request URL while editing details.
  const [mrError, setMrError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  // Holds a pending "move to Done" while we ask for a merge request link or comment.
  const [pendingDoneStatusId, setPendingDoneStatusId] = useState<number | null>(null);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [assigneeSearchTerm, setAssigneeSearchTerm] = useState('');
  const [showLabelsDropdown, setShowLabelsDropdown] = useState(false);
  const [showEpicDropdown, setShowEpicDropdown] = useState(false);
  const [showSprintDropdown, setShowSprintDropdown] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Archive / delete
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState<TicketDeleteImpact | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [issueLinks, setIssueLinks] = useState<IssueLinkGrouped>({
    blocks: [],
    blocked_by: [],
    relates_to: [],
    duplicates: [],
    duplicated_by: [],
  });
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [showWorklogModal, setShowWorklogModal] = useState(false);
  const [showWorklogsExpanded, setShowWorklogsExpanded] = useState(false);
  const [editStoryPoints, setEditStoryPoints] = useState<number | null>(null);
  const [editOriginalEstimate, setEditOriginalEstimate] = useState<number>(0);
  const [editRemainingEstimate, setEditRemainingEstimate] = useState<number>(0);
  const [showAddLinkModal, setShowAddLinkModal] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linkSearchResults, setLinkSearchResults] = useState<Array<{ id: number; key: string; title: string; type: string }>>([]);
  const [linkSearchLoading, setLinkSearchLoading] = useState(false);
  const [newLinkType, setNewLinkType] = useState<'blocks' | 'is_blocked_by' | 'relates_to' | 'duplicates'>('relates_to');
  const [selectedLinkTarget, setSelectedLinkTarget] = useState<{ id: number; key: string; title: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'comments' | 'history' | 'worklogs'>('comments');
  const [selectedSubtaskId, setSelectedSubtaskId] = useState<number | null>(null);
  // Bumped whenever a nested subtask modal reports a change, so SubtaskList (which
  // owns its own fetched state) re-fetches and reflects edits made inside that modal.
  const [subtaskRefreshKey, setSubtaskRefreshKey] = useState(0);
  const [parentTicket, setParentTicket] = useState<Ticket | null>(null);

  // Refs for dropdown click-outside handling
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);
  const priorityDropdownRef = useRef<HTMLDivElement | null>(null);
  // The priority menu is portaled to <body> with fixed positioning so it can't be
  // clipped by the modal header / scroll container.
  const priorityButtonRef = useRef<HTMLButtonElement | null>(null);
  const priorityMenuRef = useRef<HTMLDivElement | null>(null);
  const [priorityMenuPos, setPriorityMenuPos] = useState<{ top: number; left: number } | null>(null);
  // Status menu uses the same clip-proof portal treatment as priority.
  const statusButtonRef = useRef<HTMLButtonElement | null>(null);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);
  const [statusMenuPos, setStatusMenuPos] = useState<{ top: number; left: number } | null>(null);
  const assigneeDropdownRef = useRef<HTMLDivElement | null>(null);
  const labelsDropdownRef = useRef<HTMLDivElement | null>(null);
  const epicDropdownRef = useRef<HTMLDivElement | null>(null);
  const sprintDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close modal on Escape key and handle paste events + keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Check if we're in an input/textarea (don't trigger shortcuts)
      const target = e.target as HTMLElement;
      const isInInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Cmd/Ctrl + Enter to save and close
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && (isAdmin || isMember)) {
        e.preventDefault();
        handleSave();
        return;
      }

      // Don't process other shortcuts if in input
      if (isInInput) return;

      // E to edit description
      if (e.key === 'e' && (isAdmin || isMember)) {
        e.preventDefault();
        const descriptionField = document.querySelector('textarea[placeholder*="description"]') as HTMLTextAreaElement;
        if (descriptionField) {
          descriptionField.focus();
        }
        return;
      }

      // A to assign to me
      if (e.key === 'a' && (isAdmin || isMember) && user) {
        e.preventDefault();
        setEditAssigneeId(user.id);
        return;
      }

      // I to toggle status dropdown (for sprint-like interaction)
      if (e.key === 'i' && (isAdmin || isMember)) {
        e.preventDefault();
        setShowStatusDropdown((prev) => !prev);
        return;
      }
    };

    const handlePaste = async (e: ClipboardEvent) => {
      // Only allow paste if user has permissions
      if (!isAdmin && !isMember) return;

      // Check if the paste event contains images
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Check if it's an image
        if (item.type.indexOf('image/') === 0) {
          e.preventDefault(); // Prevent default paste behavior

          const blob = item.getAsFile();
          if (blob) {
            // Create file with proper name
            const timestamp = Date.now();
            const fileName = `screenshot-${timestamp}.png`;

            // Try to create a File object, fallback to using the blob directly
            let file: File;
            try {
              file = new window.File([blob], fileName, { type: blob.type || 'image/png' });
            } catch (error) {
              // If File constructor fails, use the blob with a name property
              file = blob as File;
              Object.defineProperty(file, 'name', {
                value: fileName,
                writable: false,
                enumerable: true,
                configurable: true
              });
            }

            pastedFiles.push(file);
          }
        }
      }

      // Upload pasted files if any
      if (pastedFiles.length > 0) {
        try {
          setUploadingScreenshot(true);
          const result = await ticketsAPI.uploadFile(projectId, ticketId, pastedFiles);

          // Small delay to ensure backend processing is complete
          await new Promise(resolve => setTimeout(resolve, 500));

          await loadTicketData({ silent: true });
          // Force re-render with fresh files
          const freshFiles = await ticketsAPI.getFiles(projectId, ticketId);
          setFiles(freshFiles);
        } catch (err) {
          console.error('Failed to upload pasted images:', err);
          toast.error('Failed to upload pasted screenshots. Please try again.');
        } finally {
          setUploadingScreenshot(false);
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyboard);
      document.addEventListener('paste', handlePaste);
      return () => {
        document.removeEventListener('keydown', handleKeyboard);
        document.removeEventListener('paste', handlePaste);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose, isAdmin, isMember, projectId, ticketId, user]);

  useEffect(() => {
    if (isOpen && ticketId) {
      loadTicketData();
    }
  }, [isOpen, ticketId, projectId]);

  /**
   * `silent` refreshes the data without blanking the modal. An inline edit —
   * changing status, archiving — used to flip the global loading flag, so a
   * one-field change replaced the whole modal with a spinner while it refetched
   * the ticket, files, comments, history, statuses, members, labels, epics and
   * sprints. That flash is what made a simple status change feel heavy.
   */
  const loadTicketData = async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) setLoading(true);
      setError(null);
      const [
        ticketData,
        filesData,
        statusesData,
        membersData,
        labelsData,
        epicsData,
        sprintsData,
        historyData,
        watchersData,
        linksData,
        worklogsData,
      ] = await Promise.all([
        ticketsAPI.getTicket(projectId, ticketId),
        ticketsAPI.getFiles?.(projectId, ticketId).catch(() => []) || Promise.resolve([]),
        workflowAPI.getStatuses(projectId),
        membersAPI.getMembers(projectId),
        labelsAPI.getLabels(projectId),
        epicsApi.listEpics(projectId).catch(() => []),
        sprintsAPI.getSprints(projectId).catch(() => []),
        ticketsAPI.getHistory(projectId, ticketId).catch(() => []),
        fetch(`${API_URL}/projects/${projectId}/issues/${ticketId}/watchers`, {
          credentials: 'include',
        })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
        issueLinksAPI.list(projectId, ticketId).catch(() => ({
          blocks: [],
          blocked_by: [],
          relates_to: [],
          duplicates: [],
          duplicated_by: [],
        })),
        fetch(`${API_URL}/projects/${projectId}/issues/${ticketId}/worklogs`, {
          credentials: 'include',
        })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
      ]);

      setTicket({ ...ticketData, watchers: watchersData });
      setFiles(filesData);
      setStatuses(statusesData);
      setMembers(membersData);
      setLabels(labelsData);
      setEpics(epicsData);
      setSprints(sprintsData);
      setHistory(historyData);
      setIssueLinks(linksData);
      setWorklogs(worklogsData);

      // Fetch parent ticket if this is a subtask
      if (ticketData.parent_id) {
        try {
          const parentData = await ticketsAPI.getTicket(projectId, ticketData.parent_id);
          setParentTicket(parentData);
        } catch (err) {
          console.error('Failed to load parent ticket:', err);
          setParentTicket(null);
        }
      } else {
        setParentTicket(null);
      }

      // Populate edit states
      setEditTitle(ticketData.title);
      setEditDescription(ticketData.description || '');
      setEditingDescription(false);
      setEditPriority(ticketData.priority);
      setEditAssigneeId(ticketData.assignee?.id || null);
      setEditStatusId(ticketData.status_id);
      setEditEpicId(ticketData.epic_id || null);
      setEditSprintId(ticketData.sprint_id || null);
      setEditStoryPoints(ticketData.story_points || null);
      setEditOriginalEstimate(ticketData.original_estimate_seconds || 0);
      setEditRemainingEstimate(ticketData.remaining_estimate_seconds || 0);
      // Convert label strings to label IDs by matching with the labels array
      const labelIds = (ticketData.labels || [])
        .map((labelName) => labelsData.find((l) => l.name === labelName)?.id)
        .filter((id): id is number => id !== undefined);
      setEditLabelIds(labelIds);
      setEditDueDate(ticketData.due_date || '');
      setEditMergeRequestUrl(ticketData.merge_request_url || '');
      setMrError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket details');
    } finally {
      setLoading(false);
    }
  };

  // Check if there are any unsaved changes
  const hasChanges = () => {
    if (!ticket) return false;

    if (editTitle !== ticket.title) return true;
    if (editDescription !== (ticket.description || '')) return true;
    if (editPriority !== ticket.priority) return true;
    if (editAssigneeId !== (ticket.assignee?.id || null)) return true;
    if (editStatusId !== ticket.status_id) return true;
    if (editEpicId !== (ticket.epic_id || null)) return true;
    if (editSprintId !== (ticket.sprint_id || null)) return true;
    if (editStoryPoints !== (ticket.story_points || null)) return true;
    if (editDueDate !== (ticket.due_date || '')) return true;
    if (editMergeRequestUrl !== (ticket.merge_request_url || '')) return true;

    // Check labels
    const currentLabelIds = (ticket.labels || [])
      .map(labelName => labels.find(l => l.name === labelName)?.id)
      .filter((id): id is number => id !== undefined);
    const labelsChanged =
      editLabelIds.length !== currentLabelIds.length ||
      !editLabelIds.every((id) => currentLabelIds.includes(id));
    if (labelsChanged) return true;

    return false;
  };

  // Priority changes save immediately (inline edit) rather than waiting for the
  // main Save button — this is the field users most often expect to "just stick".
  const handlePriorityChange = async (newPriority: Priority) => {
    if (!ticket || (!isAdmin && !isMember)) return;

    const previousPriority = editPriority;
    setEditPriority(newPriority);
    setShowPriorityDropdown(false);

    if (newPriority === ticket.priority) return;

    try {
      setSaving(true);
      await ticketsAPI.updateTicket(projectId, ticketId, { priority: newPriority });
      // Keep local ticket in sync so hasChanges() and the read-only view stay correct.
      setTicket((prev) => (prev ? { ...prev, priority: newPriority } : prev));
      if (onTicketUpdated) onTicketUpdated();
    } catch (err) {
      console.error('Failed to update priority:', err);
      setEditPriority(previousPriority);
      toast.error('Failed to update priority');
    } finally {
      setSaving(false);
    }
  };

  // Applies a status change (optionally attaching a merge request link and/or a
  // comment first, e.g. the evidence collected before a move to Done). Reverts the
  // optimistic status on failure and rethrows so callers can react.
  const performStatusChange = async (
    newStatusId: number,
    extra?: { mergeRequestUrl?: string; comment?: string }
  ) => {
    const previousStatusId = editStatusId;
    setEditStatusId(newStatusId);
    try {
      setSaving(true);
      // Add the comment first so it counts as evidence when the status update runs.
      if (extra?.comment?.trim()) {
        await ticketsAPI.addComment(projectId, ticketId, extra.comment.trim());
      }
      const updates: TicketUpdateData = { status_id: newStatusId };
      if (extra?.mergeRequestUrl?.trim()) {
        updates.merge_request_url = extra.mergeRequestUrl.trim();
      }
      await ticketsAPI.updateTicket(projectId, ticketId, updates);
      if (onTicketUpdated) onTicketUpdated();
      // Refresh in the background so status_name / completed_at / history catch up
      // without the modal disappearing under the user.
      await loadTicketData({ silent: true });
    } catch (err) {
      console.error('Failed to update status:', err);
      setEditStatusId(previousStatusId);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  // Status changes save immediately too (matches the priority behavior). Moving into an
  // evidence-required status (In Review, Testing, Done, …) needs a merge request link; if
  // there isn't one we ask for an MR link or a comment via DoneEvidenceModal. The backend
  // also enforces this as a safety net.
  const handleStatusChange = async (newStatusId: number) => {
    if (!ticket || (!isAdmin && !isMember)) return;

    setShowStatusDropdown(false);

    if (newStatusId === ticket.status_id) {
      setEditStatusId(newStatusId);
      return;
    }

    const targetStatus = statuses.find((s) => s.id === newStatusId);
    const currentStatus = statuses.find((s) => s.id === ticket.status_id);
    const isEvidenceTarget = !!targetStatus && EVIDENCE_REQUIRED_STATUS_NAMES.includes(targetStatus.name);
    const wasEvidenceStatus = !!currentStatus && EVIDENCE_REQUIRED_STATUS_NAMES.includes(currentStatus.name);
    const typedMr = (editMergeRequestUrl || '').trim();
    const effectiveMr = typedMr || (ticket.merge_request_url || '').trim();

    // Only prompt on entry from a non-evidence status, so the normal In Review -> Testing
    // hand-off isn't re-prompted (evidence was already required at In Review).
    if (isEvidenceTarget && !wasEvidenceStatus && !effectiveMr) {
      // No merge request link yet — collect an MR link or a comment before moving.
      setPendingDoneStatusId(newStatusId);
      return;
    }

    try {
      // Carry a typed-but-unsaved MR link along so the move isn't blocked.
      const extra =
        typedMr && typedMr !== (ticket.merge_request_url || '')
          ? { mergeRequestUrl: typedMr }
          : undefined;
      await performStatusChange(newStatusId, extra);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  useEffect(() => {
    if (!showMoreMenu) return;
    const close = (event: MouseEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) setShowMoreMenu(false);
    };
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowMoreMenu(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onEsc);
    };
  }, [showMoreMenu]);

  const currentStatusColor =
    statuses.find((status) => status.id === editStatusId)?.color || tokens.colors.neutral[400];

  // Only the reporter or an admin may delete; the backend enforces the same rule.
  const canDelete = !!ticket && (isAdmin || ticket.reporter?.email === user?.email);

  const hasDeleteImpact =
    !!deleteImpact &&
    (deleteImpact.subtasks > 0 ||
      deleteImpact.comments > 0 ||
      deleteImpact.attachments > 0 ||
      deleteImpact.worklogs > 0);

  const handleToggleArchive = async () => {
    if (!ticket || (!isAdmin && !isMember)) return;

    setArchiving(true);
    try {
      if (ticket.archived) {
        await ticketsAPI.unarchiveTicket(projectId, ticket.id);
      } else {
        await ticketsAPI.archiveTicket(projectId, ticket.id);
      }
      onTicketUpdated?.();
      onClose();
      toast.success(ticket.archived ? 'Issue restored' : 'Issue archived');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive ticket');
    } finally {
      setArchiving(false);
    }
  };

  // Fetch what the delete would destroy before asking, so the warning is specific.
  const openDeleteConfirm = async () => {
    if (!ticket) return;
    setDeleteImpact(null);
    setShowDeleteConfirm(true);
    try {
      setDeleteImpact(await ticketsAPI.getDeleteImpact(projectId, ticket.id));
    } catch {
      // Fall back to a generic warning rather than blocking the delete.
    }
  };

  const handleDelete = async () => {
    if (!ticket) return;

    setDeleting(true);
    try {
      await ticketsAPI.deleteTicket(projectId, ticket.id);
      setShowDeleteConfirm(false);
      onTicketUpdated?.();
      onClose();
      toast.success('Issue deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete ticket');
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    if (!ticket || (!isAdmin && !isMember)) return;

    try {
      setSaving(true);
      const updates: TicketUpdateData = {};

      if (editTitle !== ticket.title) updates.title = editTitle;
      if (editDescription !== (ticket.description || '')) updates.description = editDescription;
      if (editPriority !== ticket.priority) updates.priority = editPriority;
      if (editAssigneeId !== (ticket.assignee?.id || null)) {
        // API now keys assignee by email; resolve member by id and send email (or null to unassign).
        const selectedMember = editAssigneeId
          ? members.find((m) => m.user_id === editAssigneeId)
          : null;
        updates.assignee_email = selectedMember?.email ?? null;
      }
      if (editStatusId !== ticket.status_id) updates.status_id = editStatusId || undefined;
      if (editEpicId !== (ticket.epic_id || null)) updates.epic_id = editEpicId || undefined;
      if (editSprintId !== (ticket.sprint_id || null)) updates.sprint_id = editSprintId || undefined;
      if (editStoryPoints !== (ticket.story_points || null)) updates.story_points = editStoryPoints || undefined;

      // Convert current label strings to IDs for comparison
      const currentLabelIds = (ticket.labels || [])
        .map(labelName => labels.find(l => l.name === labelName)?.id)
        .filter((id): id is number => id !== undefined);
      const labelsChanged =
        editLabelIds.length !== currentLabelIds.length ||
        !editLabelIds.every((id) => currentLabelIds.includes(id));
      if (labelsChanged) {
        // Convert label IDs to label names for the API
        const labelNames = editLabelIds
          .map(id => labels.find(l => l.id === id)?.name)
          .filter((name): name is string => name !== undefined);
        updates.labels = labelNames;
      }
      if (editDueDate !== (ticket.due_date || '')) updates.due_date = editDueDate || undefined;
      if (editMergeRequestUrl !== (ticket.merge_request_url || '')) {
        // Store a normalized, clickable link (or clear it when emptied).
        updates.merge_request_url = editMergeRequestUrl.trim()
          ? normalizeUrl(editMergeRequestUrl)
          : undefined;
      }

      if (Object.keys(updates).length > 0) {
        await ticketsAPI.updateTicket(projectId, ticketId, updates);
        if (onTicketUpdated) onTicketUpdated();
        // Reload ticket data to show updated values
        loadTicketData({ silent: true });
        toast.success('Changes saved');
      }
    } catch (err) {
      console.error('Failed to update ticket:', err);
      toast.error('Failed to save ticket changes');
    } finally {
      setSaving(false);
    }
  };

  // Details rail: save a single field change directly to the API without diffing state.
  const saveFieldDirectly = async (updates: TicketUpdateData) => {
    if (!ticket || (!isAdmin && !isMember)) return;
    try {
      setSaving(true);
      await ticketsAPI.updateTicket(projectId, ticketId, updates);
      if (onTicketUpdated) onTicketUpdated();
      loadTicketData({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0 || (!isAdmin && !isMember)) return;

    const attachments: FileAttachment[] = Array.from(selectedFiles).map((file) => ({
      file,
      id: Math.random().toString(36).substring(7),
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));

    setNewFiles((prev) => [...prev, ...attachments]);

    try {
      setUploading(true);
      await ticketsAPI.uploadFile(projectId, ticketId, selectedFiles);
      await loadTicketData({ silent: true });
      setNewFiles([]);
    } catch (err) {
      console.error('Failed to upload files:', err);
      // Surface the server's reason (e.g. unsupported type / too large) rather than a generic message.
      toast.error(err instanceof Error ? err.message : 'Failed to upload files');
      // Drop the optimistic entries that never made it to the server.
      setNewFiles([]);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    try {
      await ticketsAPI.deleteFile(projectId, ticketId, fileId);
      await loadTicketData({ silent: true });
    } catch (err) {
      console.error('Failed to delete file:', err);
      toast.error('Failed to delete file');
    }
  };

  const handleRemoveLink = async (linkId: number) => {
    try {
      await issueLinksAPI.delete(projectId, linkId);
      await loadTicketData({ silent: true });
    } catch (err) {
      console.error('Failed to remove link:', err);
      throw err;
    }
  };

  const handleLinkSearch = async (query: string) => {
    setLinkSearchQuery(query);
    setSelectedLinkTarget(null);
    if (!query.trim()) { setLinkSearchResults([]); return; }
    setLinkSearchLoading(true);
    try {
      const resp = await fetch(
        `${API_URL}/projects/${projectId}/tickets?include_subtasks=true`,
        { credentials: 'include' }
      );
      if (!resp.ok) throw new Error('Failed to search');
      const all: Array<{ id: number; key: string; title: string; type: string }> = await resp.json();
      const q = query.toLowerCase();
      setLinkSearchResults(
        all
          .filter(t => t.id !== ticketId && (t.key.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)))
          .slice(0, 8)
      );
    } catch {
      setLinkSearchResults([]);
    } finally {
      setLinkSearchLoading(false);
    }
  };

  const handleAddLink = async () => {
    if (!selectedLinkTarget) return;
    try {
      await issueLinksAPI.create(projectId, ticketId, {
        target_issue_id: selectedLinkTarget.id,
        link_type: newLinkType,
      });
      setShowAddLinkModal(false);
      setLinkSearchQuery('');
      setLinkSearchResults([]);
      setSelectedLinkTarget(null);
      await loadTicketData({ silent: true });
      toast.success(`Linked ${selectedLinkTarget.key}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to add link');
    }
  };

  const handleLogWork = async (worklogData: any) => {
    try {
      const response = await fetch(
        `${API_URL}/projects/${projectId}/issues/${ticketId}/worklogs`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(worklogData),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to log work');
      }

      await loadTicketData({ silent: true });
    } catch (err) {
      console.error('Failed to log work:', err);
      throw err;
    }
  };

  const handleDeleteWorklog = async (worklogId: number) => {
    if (!confirm('Are you sure you want to delete this worklog?')) return;

    try {
      const response = await fetch(
        `${API_URL}/projects/${projectId}/issues/${ticketId}/worklogs/${worklogId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete worklog');
      }

      await loadTicketData({ silent: true });
    } catch (err) {
      console.error('Failed to delete worklog:', err);
      toast.error('Failed to delete worklog');
    }
  };

  const handleNavigateToIssue = (issueId: number) => {
    // Open the subtask/linked issue in a new modal
    setSelectedSubtaskId(issueId);
  };

  // The priority & status menus are fixed-positioned; close them if the user
  // scrolls the underlying page/modal so they can't linger detached from their
  // trigger. Scrolling WITHIN a menu (its own list overflows) must NOT close it —
  // the capture-phase listener otherwise catches the menu's own scroll too.
  useEffect(() => {
    if (!showPriorityDropdown && !showStatusDropdown) return;
    const close = (e?: Event) => {
      if (e && e.type === 'scroll') {
        const target = e.target as Node | null;
        if (
          target &&
          ((statusMenuRef.current && statusMenuRef.current.contains(target)) ||
            (priorityMenuRef.current && priorityMenuRef.current.contains(target)))
        ) {
          return;
        }
      }
      setShowPriorityDropdown(false);
      setShowStatusDropdown(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [showPriorityDropdown, showStatusDropdown]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node) &&
        (!statusMenuRef.current || !statusMenuRef.current.contains(e.target as Node))
      ) {
        setShowStatusDropdown(false);
      }
      if (
        priorityDropdownRef.current && !priorityDropdownRef.current.contains(e.target as Node) &&
        (!priorityMenuRef.current || !priorityMenuRef.current.contains(e.target as Node))
      ) {
        setShowPriorityDropdown(false);
      }
      if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(e.target as Node)) {
        setShowAssigneeDropdown(false);
        setAssigneeSearchTerm('');
      }
      if (labelsDropdownRef.current && !labelsDropdownRef.current.contains(e.target as Node)) {
        setShowLabelsDropdown(false);
      }
      if (epicDropdownRef.current && !epicDropdownRef.current.contains(e.target as Node)) {
        setShowEpicDropdown(false);
      }
      if (sprintDropdownRef.current && !sprintDropdownRef.current.contains(e.target as Node)) {
        setShowSprintDropdown(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);


  // Filter members based on search term
  const filteredMembers = members.filter(member => {
    if (assigneeSearchTerm) {
      const searchLower = assigneeSearchTerm.toLowerCase();
      const nameMatch = member.name.toLowerCase().includes(searchLower);
      const emailMatch = member.email.toLowerCase().includes(searchLower);
      return nameMatch || emailMatch;
    }
    return true;
  });


  return {
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
  };
}
