'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, ChevronRight, Check, Upload, File, Image, XCircle, Sparkles, TrendingUp, Camera } from 'lucide-react';
import { ticketsAPI, TicketCreateData } from '../../lib/api/tickets';
import {
  workflowAPI,
  WorkflowStatus,
  membersAPI,
  ProjectMember,
  labelsAPI,
  Label,
} from '../../lib/api/settings';
import { epicsApi, EpicListItem } from '../../lib/api/epics';
import { recommendationsAPI, RecommendationResult, skillsAPI, Skill, EmployeeProfile } from '../../lib/api/skills';
import { sprintsAPI, Sprint } from '../../lib/api/sprints';
import { subtasksAPI } from '../../lib/api/subtasks';
import { ButtonCore } from '../ui';
import { issueLinksAPI } from '../../lib/api/issue-links';
import { ISSUE_TYPE_ICON } from '../issue/issueTypeMeta';
import { todayLocal } from '../../lib/date';
import { tokens } from '../../design-system/tokens';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../ui';
import RichTextEditor from '../RichTextEditor';
import { CloneTicketData, FileAttachment, Priority, PriorityValue } from './types';
import { ISSUE_TYPES, DISCIPLINE_OPTIONS, PRIORITIES, PARENT_RESULT_LIMIT, PARENT_TYPES, MAX_ATTACHMENT_BYTES } from './constants';
import { LabelsField } from './LabelsField';
import { PriorityAssigneeRow } from './PriorityAssigneeRow';

export interface UseCreateIssueParams {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  onIssueCreated?: () => void;
  defaultStatusId?: number;
  defaultSprintId?: number;
  cloneData?: CloneTicketData;
}

export function useCreateIssue({
  isOpen, onClose, projectId, onIssueCreated, defaultStatusId, defaultSprintId, cloneData,
}: UseCreateIssueParams) {
  const { user } = useAuth();
  const toast = useToast();

  // Attachments are capped at 10MB per file, matching the hint shown in the
  // upload area. Accepts images + PDFs under the cap; anything oversized is
  // dropped with a toast so the user is not left wondering why it vanished.
  const acceptAttachments = (incoming: File[]): File[] => {
    const typeOk = incoming.filter(
      (f) => f.type.startsWith('image/') || f.type === 'application/pdf',
    );
    const underCap = typeOk.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    const tooBig = typeOk.length - underCap.length;
    if (tooBig > 0) {
      toast.error(
        tooBig === 1
          ? 'That file is larger than 10MB and was skipped.'
          : `${tooBig} files are larger than 10MB and were skipped.`,
      );
    }
    return underCap;
  };
  // cloneData is an object prop with a fresh identity on every parent render, so effects
  // depend on this primitive instead - otherwise they'd re-run and re-stomp the defaults.
  const isCloning = !!cloneData;
  const [type, setType] = useState<string>('task');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<PriorityValue>('medium');
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [epicId, setEpicId] = useState<number | null>(null);
  const [statusId, setStatusId] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [sprintId, setSprintId] = useState<number | null>(null);
  const [storyPoints, setStoryPoints] = useState<string>('');
  const [parentId, setParentId] = useState<number | null>(null);
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([]);
  const [relatedTicketId, setRelatedTicketId] = useState<number | null>(null);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [epics, setEpics] = useState<EpicListItem[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [parentIssues, setParentIssues] = useState<any[]>([]);
  const [parentSearch, setParentSearch] = useState('');
  const [loadingParents, setLoadingParents] = useState(false);
  const [parentCursor, setParentCursor] = useState<string | null>(null);
  const [parentTotal, setParentTotal] = useState(0);
  const [loadingMoreParents, setLoadingMoreParents] = useState(false);
  // The chosen parent, kept aside so the button can still name it after the
  // search results have moved on to something else.
  const [chosenParent, setChosenParent] = useState<{ id: number; key: string } | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>([]);
  const [creatingNewLabel, setCreatingNewLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#3b82f6');

  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [showEpicDropdown, setShowEpicDropdown] = useState(false);
  const [showSprintDropdown, setShowSprintDropdown] = useState(false);
  const [showParentDropdown, setShowParentDropdown] = useState(false);
  const [showRelatedDropdown, setShowRelatedDropdown] = useState(false);
  const [showLabelsDropdown, setShowLabelsDropdown] = useState(false);
  const [assigneeSearchTerm, setAssigneeSearchTerm] = useState('');

  const [files, setFiles] = useState<FileAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optional fields (dates, story points, labels, attachments) are collapsed by default.
  const [showMoreDetails, setShowMoreDetails] = useState(false);

  // Recommendations state
  const [recommendations, setRecommendations] = useState<RecommendationResult[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);

  // Skills filtering state
  const [availableSkills, setAvailableSkills] = useState<Skill[]>([]);
  const [selectedSkillFilters, setSelectedSkillFilters] = useState<number[]>([]);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfile[]>([]);

  // Tracks whether the creator-as-assignee default has been applied for this open cycle.
  const assigneeDefaultedRef = useRef(false);

  // Refs for dropdown click-outside handling
  const typeDropdownRef = useRef<HTMLDivElement | null>(null);
  const priorityDropdownRef = useRef<HTMLDivElement | null>(null);
  const assigneeDropdownRef = useRef<HTMLDivElement | null>(null);
  const epicDropdownRef = useRef<HTMLDivElement | null>(null);
  const sprintDropdownRef = useRef<HTMLDivElement | null>(null);
  const parentDropdownRef = useRef<HTMLDivElement | null>(null);
  const parentSearchRef = useRef<HTMLInputElement>(null);
  const relatedDropdownRef = useRef<HTMLDivElement | null>(null);
  const labelsDropdownRef = useRef<HTMLDivElement | null>(null);

  /**
   * Candidate parents, matched by the server as you type.
   *
   * This list used to be every ticket in the project, fetched when the modal
   * opened and filtered in the browser - several megabytes on a large project
   * to populate a dropdown from which one issue gets picked. Only runs while
   * the dropdown is open, so the common case of not creating a subtask costs
   * nothing at all.
   */
  useEffect(() => {
    if (!isOpen || !projectId || !showParentDropdown) return;
    let cancelled = false;

    const run = async () => {
      setLoadingParents(true);
      try {
        // Filtered by the server: narrowing a page of 20 here would quietly
        // return fewer than 20, and drop candidates that were never fetched.
        const page = await ticketsAPI.getTicketsPage(projectId, {
          q: parentSearch.trim() || undefined,
          types: PARENT_TYPES,
          limit: PARENT_RESULT_LIMIT,
        });
        if (cancelled) return;
        setParentIssues(page.items);
        setParentCursor(page.next_cursor);
        setParentTotal(page.total);
      } catch (err) {
        if (!cancelled) console.error('Failed to load parent issues:', err);
      } finally {
        if (!cancelled) setLoadingParents(false);
      }
    };

    const timer = window.setTimeout(run, parentSearch ? 300 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, projectId, showParentDropdown, parentSearch]);

  /** The next page of parent candidates for the current search. */
  const loadMoreParents = async () => {
    if (!parentCursor || loadingMoreParents) return;
    setLoadingMoreParents(true);
    try {
      const page = await ticketsAPI.getTicketsPage(projectId, {
        q: parentSearch.trim() || undefined,
        types: PARENT_TYPES,
        limit: PARENT_RESULT_LIMIT,
        cursor: parentCursor,
      });
      setParentIssues((prev) => [...prev, ...page.items]);
      setParentCursor(page.next_cursor);
    } catch (err) {
      console.error('Failed to load more parent issues:', err);
    } finally {
      setLoadingMoreParents(false);
    }
  };

  // Fetch statuses and members when modal opens
  useEffect(() => {
    if (isOpen && projectId) {
      const fetchData = async () => {
        try {
          const [fetchedStatuses, fetchedMembers, fetchedEpics, fetchedSprints, fetchedLabels, fetchedSkills, fetchedEmployees] = await Promise.all([
            workflowAPI.getStatuses(projectId),
            membersAPI.getMembers(projectId),
            epicsApi.listEpics(projectId),
            sprintsAPI.getSprints(projectId),
            labelsAPI.getLabels(projectId),
            skillsAPI.getSkills(),
            skillsAPI.getEmployees(),
          ]);

          setStatuses(fetchedStatuses);
          setMembers(fetchedMembers);
          setEpics(fetchedEpics);
          setSprints(fetchedSprints.filter(s => s.state === 'active' || s.state === 'future'));
          setLabels(fetchedLabels);
          setAvailableSkills(fetchedSkills);
          setEmployeeProfiles(fetchedEmployees);

          // Set default status
          if (defaultStatusId) {
            setStatusId(defaultStatusId);
          } else if (fetchedStatuses.length > 0) {
            setStatusId(fetchedStatuses[0].id);
          }

          // Default the sprint to the one we're creating from (e.g. the active sprint on
          // the sprint board). Cloning keeps its own values; epics may not have a sprint.
          if (defaultSprintId && !isCloning) {
            setSprintId(defaultSprintId);
          }
        } catch (err) {
          console.error('Failed to fetch data:', err);
        }
      };

      fetchData();
    }
  }, [isOpen, projectId, defaultStatusId, defaultSprintId, isCloning]);

  // Populate form from clone data when provided
  useEffect(() => {
    if (isOpen && cloneData) {
      setTitle(`${cloneData.title} (Copy)`);
      setDescription(cloneData.description || '');
      setType(cloneData.type);
      if (cloneData.priority) {
        setPriority(cloneData.priority);
      }
      if (cloneData.assigneeId !== undefined) {
        setAssigneeId(cloneData.assigneeId);
      }
      if (cloneData.epicId !== undefined) {
        setEpicId(cloneData.epicId);
      }
      if (cloneData.labelIds) {
        setSelectedLabelIds(cloneData.labelIds);
      }
      if (cloneData.dueDate) {
        setDueDate(cloneData.dueDate);
      }
    }
  }, [isOpen, cloneData]);

  // Default the assignee to whoever is creating the ticket, rather than Unassigned.
  // Applied once per open, so it never overwrites a manual choice (including an
  // explicit "Unassigned"). Cloning keeps the cloned assignee. If the creator isn't a
  // member of this project there's nothing to assign to, so it stays unassigned.
  useEffect(() => {
    if (!isOpen) {
      assigneeDefaultedRef.current = false;
      return;
    }
    if (assigneeDefaultedRef.current || isCloning) return;
    if (!user || members.length === 0) return;

    const me = members.find((m) => m.email === user.email);
    if (me) {
      setAssigneeId(me.user_id);
    }
    assigneeDefaultedRef.current = true;
  }, [isOpen, user, members, isCloning]);

  // Clear story points and sprint when type changes to Epic
  useEffect(() => {
    if (type === 'epic') {
      setStoryPoints('');
      setSprintId(null);
    }
    // Discipline subtasks only apply to stories
    if (type !== 'story') {
      setSelectedDisciplines([]);
    }
    // Related ticket linking only applies to bugs
    if (type !== 'bug') {
      setRelatedTicketId(null);
    }
  }, [type]);

  // Close modal on Escape key and handle paste events
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close any open dropdowns first
        if (showTypeDropdown || showPriorityDropdown || showAssigneeDropdown || showEpicDropdown || showSprintDropdown || showParentDropdown || showRelatedDropdown || showLabelsDropdown) {
          setShowTypeDropdown(false);
          setShowPriorityDropdown(false);
          setShowAssigneeDropdown(false);
          setShowEpicDropdown(false);
          setShowSprintDropdown(false);
          setShowParentDropdown(false);
          setShowRelatedDropdown(false);
          setShowLabelsDropdown(false);
        } else {
          // If no dropdowns are open, close the modal
          onClose();
        }
      }
    };

    const handlePaste = async (e: ClipboardEvent) => {
      // Only handle paste in the description field or when the modal is focused
      const target = e.target as HTMLElement;
      const isDescriptionField = target.tagName === 'TEXTAREA' || target.closest('[data-description-field]');

      if (!isDescriptionField) return;

      // Check if the paste event contains images
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Check if it's an image
        if (item.type.indexOf('image/') === 0) {
          e.preventDefault(); // Prevent default paste behavior

          const blob = item.getAsFile();
          if (blob && blob.size > MAX_ATTACHMENT_BYTES) {
            toast.error('That image is larger than 10MB and was skipped.');
            continue;
          }
          if (blob) {
            // Create file attachment with proper name
            const timestamp = Date.now();
            const fileName = `screenshot-${timestamp}.png`;
            const id = `${timestamp}-${Math.random()}`;

            // Try to create a File object, fallback to using the blob directly
            let file: File | Blob;
            try {
              // Try using the File constructor
              file = new window.File([blob], fileName, { type: blob.type || 'image/png' });
            } catch (error) {
              // Fallback: use the blob directly with a name property
              file = blob;
              Object.defineProperty(file, 'name', {
                value: fileName,
                writable: false,
                enumerable: true,
                configurable: true
              });
            }

            const attachment: FileAttachment = {
              file,
              id,
              name: fileName
            };

            // Create preview for the image
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
              setFiles(prev => prev.map(f =>
                f.id === id
                  ? { ...f, preview: readerEvent.target?.result as string }
                  : f
              ));
            };
            reader.readAsDataURL(file);

            // Add file to the list
            setFiles(prev => [...prev, attachment]);
          }
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('paste', handlePaste);
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.removeEventListener('paste', handlePaste);
      };
    }
  }, [isOpen, onClose, showTypeDropdown, showPriorityDropdown, showAssigneeDropdown, showEpicDropdown, showSprintDropdown, showParentDropdown, showRelatedDropdown, showLabelsDropdown]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setType('task');
      setTitle('');
      setDescription('');
      setPriority('medium');
      setAssigneeId(null);
      setEpicId(null);
      setSprintId(null);
      setParentId(null);
      setChosenParent(null);
      setParentSearch('');
      setSelectedDisciplines([]);
      setRelatedTicketId(null);
      setShowRelatedDropdown(false);
      setStoryPoints('');
      setDueDate('');
      setStartDate('');
      setFiles([]);
      setError(null);
      setSelectedLabelIds([]);
      setAssigneeSearchTerm('');
      setShowLabelsDropdown(false);
      setShowSprintDropdown(false);
      setShowParentDropdown(false);
      setSelectedSkillFilters([]);
      setRecommendations([]);
      setShowRecommendations(false);
      setShowMoreDetails(false);
    }
  }, [isOpen]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (
        typeDropdownRef.current &&
        !typeDropdownRef.current.contains(target)
      ) {
        setShowTypeDropdown(false);
      }
      if (
        priorityDropdownRef.current &&
        !priorityDropdownRef.current.contains(target)
      ) {
        setShowPriorityDropdown(false);
      }
      if (
        assigneeDropdownRef.current &&
        !assigneeDropdownRef.current.contains(target)
      ) {
        setShowAssigneeDropdown(false);
      }
      if (
        epicDropdownRef.current &&
        !epicDropdownRef.current.contains(target)
      ) {
        setShowEpicDropdown(false);
      }
      if (
        sprintDropdownRef.current &&
        !sprintDropdownRef.current.contains(target)
      ) {
        setShowSprintDropdown(false);
      }
      if (
        parentDropdownRef.current &&
        !parentDropdownRef.current.contains(target)
      ) {
        setShowParentDropdown(false);
      }
      if (
        relatedDropdownRef.current &&
        !relatedDropdownRef.current.contains(target)
      ) {
        setShowRelatedDropdown(false);
      }
      if (
        labelsDropdownRef.current &&
        !labelsDropdownRef.current.contains(target)
      ) {
        setShowLabelsDropdown(false);
      }
    };

    if (showTypeDropdown || showPriorityDropdown || showAssigneeDropdown || showEpicDropdown || showSprintDropdown || showParentDropdown || showRelatedDropdown || showLabelsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showTypeDropdown, showPriorityDropdown, showAssigneeDropdown, showEpicDropdown, showSprintDropdown, showParentDropdown, showRelatedDropdown, showLabelsDropdown]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles = acceptAttachments(selectedFiles);

    const newFiles: FileAttachment[] = validFiles.map(file => {
      const id = `${Date.now()}-${Math.random()}`;
      const attachment: FileAttachment = { file, id };
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setFiles(prev => prev.map(f => f.id === id ? { ...f, preview: e.target?.result as string } : f));
        };
        reader.readAsDataURL(file);
      }
      
      return attachment;
    });

    setFiles(prev => [...prev, ...newFiles]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const getFileIcon = (file: File | Blob) => {
    if (file.type.startsWith('image/')) {
      return <Image size={16} />;
    }
    if (file.type === 'application/pdf') {
      return <File size={16} />;
    }
    return <File size={16} />;
  };

  // Handle creating a new label
  const handleCreateLabel = async () => {
    const trimmedName = newLabelName.trim();

    // Validate: name must not be empty
    if (!trimmedName) {
      setError('Label name cannot be empty');
      return;
    }

    // Validate: check for duplicates (case-insensitive)
    const isDuplicate = labels.some(
      label => label.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      setError('A label with this name already exists');
      return;
    }

    try {
      const newLabel = await labelsAPI.createLabel(projectId, {
        name: trimmedName,
        color: newLabelColor,
      });

      // Add new label to the list and select it
      setLabels(prev => [...prev, newLabel]);
      setSelectedLabelIds(prev => [...prev, newLabel.id]);

      // Reset form
      setNewLabelName('');
      setNewLabelColor('#3b82f6');
      setCreatingNewLabel(false);
      setError(null); // Clear any previous errors
    } catch (err) {
      console.error('Failed to create label:', err);
      setError('Failed to create label. Please try again.');
    }
  };

  // Fetch developer recommendations based on title and description
  const fetchRecommendations = async () => {
    if (!title.trim() || title.trim().length < 5) {
      setRecommendations([]);
      return;
    }

    setLoadingRecommendations(true);
    try {
      // Extract potential skill keywords from title and description
      const text = `${title} ${description}`.toLowerCase();
      const skillKeywords = [
        'react', 'vue', 'angular', 'typescript', 'javascript', 'html', 'css',
        'python', 'fastapi', 'django', 'node', 'express',
        'mongodb', 'postgresql', 'mysql', 'redis',
        'docker', 'kubernetes', 'aws', 'azure',
        'design', 'ui', 'ux', 'figma',
        'testing', 'qa', 'jest', 'pytest'
      ];

      const detectedSkills = skillKeywords.filter(skill => text.includes(skill));

      const results = await recommendationsAPI.getRecommendations(detectedSkills, {
        project_id: projectId,
        ticket_type: type,
        priority: priority,
        limit: 5,
      });

      setRecommendations(results);
      if (results.length > 0 && !assigneeId) {
        setShowRecommendations(true);
      }
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
      setRecommendations([]);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  // Debounced recommendation fetch
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isOpen && title.trim().length >= 5) {
        fetchRecommendations();
      }
    }, 1000); // Wait 1 second after user stops typing

    return () => clearTimeout(timer);
  }, [title, description, type, priority, isOpen]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!statusId) {
      setError('Status is required');
      return;
    }

    // Due date is optional for Epics (they span multiple sprints)
    if (!dueDate && type !== 'epic') {
      setError('Due date is required');
      return;
    }

    // Subtasks must have a parent issue
    if (type === 'subtask' && !parentId) {
      setError('Parent issue is required for subtasks');
      return;
    }

    // A start date may be backdated — work can have begun before it was logged in GRID.
    // The due date still can't be in the past, nor precede the start date.
    // YYYY-MM-DD strings compare correctly with <, so no Date parsing needed.
    const today = todayLocal();
    if (dueDate && dueDate < today) {
      setError('Due date cannot be in the past');
      return;
    }
    if (dueDate && startDate && dueDate < startDate) {
      setError('Due date cannot be before the start date');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const selectedLabels =
        selectedLabelIds.length > 0
          ? labels
              .filter((label) => selectedLabelIds.includes(label.id))
              .map((label) => label.name)
          : undefined;

      // Resolve assignee numeric id to email (API now keys assignee by email).
      const selectedMember = assigneeId
        ? members.find((m) => m.user_id === assigneeId)
        : null;

      const createData: TicketCreateData = {
        title: title.trim(),
        description: description.trim() || undefined,
        type: type as 'story' | 'task' | 'bug' | 'epic' | 'subtask' | 'campaign' | 'design' | 'engineering',
        status_id: statusId,
        priority,
        assignee_email: selectedMember?.email,
        epic_id: epicId || undefined,
        parent_id: parentId || undefined,
        sprint_id: sprintId || undefined,
        story_points: storyPoints ? parseInt(storyPoints) : undefined,
        due_date: dueDate || undefined,
        start_date: startDate || undefined,
        labels: selectedLabels,
      };

      // Create ticket first
      const ticket = await ticketsAPI.createTicket(projectId, createData);

      // For stories, create linked discipline subtasks (Design / Frontend / Backend / QA)
      if (type === 'story' && selectedDisciplines.length > 0) {
        const disciplineResults = await Promise.allSettled(
          DISCIPLINE_OPTIONS.filter((d) => selectedDisciplines.includes(d.value)).map((d) =>
            subtasksAPI.create(projectId, ticket.id, {
              title: `[${d.label}] ${title.trim()}`,
              status_id: statusId,
              priority,
              due_date: dueDate || undefined,
            })
          )
        );
        disciplineResults.forEach((result) => {
          if (result.status === 'rejected') {
            console.error('Failed to create discipline subtask:', result.reason);
          }
        });
      }

      // For bugs, link to the related ticket (relates_to)
      if (type === 'bug' && relatedTicketId) {
        try {
          await issueLinksAPI.create(projectId, ticket.id, {
            target_issue_id: relatedTicketId,
            link_type: 'relates_to',
          });
        } catch (linkError) {
          console.error('Failed to link related ticket:', linkError);
          // Don't fail the whole operation if linking fails
        }
      }

      // Upload files (including pasted images)
      if (files.length > 0) {
        const formData = new FormData();
        files.forEach((fileAttachment) => {
          // Check if it's already a File (has a name property and is a Blob)
          const hasName = 'name' in fileAttachment.file;

          if (hasName) {
            // It's likely a File object, append it directly
            formData.append('files', fileAttachment.file as File);
          } else {
            // It's a Blob, we need to give it a name
            const fileName = fileAttachment.name || `file-${Date.now()}`;
            formData.append('files', fileAttachment.file, fileName);
          }
        });

        try {
          await ticketsAPI.uploadFiles(projectId, ticket.id, formData);
        } catch (fileError) {
          console.error('Failed to upload files:', fileError);
          // Don't fail the whole operation if file upload fails
        }
      }

      // Success - close modal and notify parent
      onClose();
      toast.success(`${ticket.key} created`);
      if (onIssueCreated) {
        onIssueCreated();
      }
    } catch (err) {
      console.error('Failed to create issue:', err);
      setError('Failed to create issue. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Collapsed sections must never hide state. Summarise anything set inside "More details"
  // so the user can see it without expanding.
  const detailsSummary = [
    startDate && 'start date',
    storyPoints && `${storyPoints} pts`,
    files.length > 0 && `${files.length} file${files.length === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(', ');


  const selectedIssueType = ISSUE_TYPES.find(t => t.value === type) || ISSUE_TYPES[0];
  const selectedPriority = PRIORITIES.find(p => p.value === priority) || PRIORITIES[2];
  const selectedAssignee = members.find(m => m.user_id === assigneeId);

  // Filter members based on selected skills and search term
  const filteredMembers = members.filter(member => {
    // Filter by search term
    if (assigneeSearchTerm) {
      const searchLower = assigneeSearchTerm.toLowerCase();
      const nameMatch = member.name.toLowerCase().includes(searchLower);
      const emailMatch = member.email.toLowerCase().includes(searchLower);
      if (!nameMatch && !emailMatch) return false;
    }

    // Filter by skills if any are selected
    if (selectedSkillFilters.length > 0) {
      const employeeProfile = employeeProfiles.find(ep => ep.id === member.user_id);
      if (!employeeProfile) return false;

      // Check if employee has ALL selected skills
      const employeeSkillIds = employeeProfile.skills.map(s => s.skill_id);
      return selectedSkillFilters.every(skillId => employeeSkillIds.includes(skillId));
    }

    return true;
  });


  return {
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
  };
}
