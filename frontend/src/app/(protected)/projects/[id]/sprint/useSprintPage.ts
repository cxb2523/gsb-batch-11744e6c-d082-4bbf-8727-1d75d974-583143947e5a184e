import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useTicketsChanged } from '@/lib/ticketEvents';
import { sprintsAPI, Sprint, SprintCapacity, SprintState } from '../../../../../lib/api/sprints';
import { ticketsAPI } from '../../../../../lib/api/tickets';
import { workflowAPI, WorkflowStatus } from '../../../../../lib/api/settings';
import { membersAPI, ProjectMember } from '../../../../../lib/api/settings';
import { IssueCardData } from '../../../../../components/board/IssueCard';
import { toIssueCardData } from '../../../../../lib/boardCard';
import { useTicketBoard } from '../../../../../hooks/useTicketBoard';
import { useAuth } from '../../../../../hooks/useAuth';
import { IssueCard, GroupBy } from './types';

export function useSprintPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const projectId = parseInt(params.id as string);

  const { user, isAdmin } = useAuth();

  // State
  const [activeSprints, setActiveSprints] = useState<Sprint[]>([]);
  const [activeSprint, setActiveSprint] = useState<Sprint | null>(null);
  const activeSprintIdRef = useRef<number | null>(null);
  const [futureSprints, setFutureSprints] = useState<Sprint[]>([]);
  const [capacity, setCapacity] = useState<SprintCapacity | null>(null);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [issues, setIssues] = useState<IssueCardData[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [epics, setEpics] = useState<IssueCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState<number | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<IssueCard['type'] | 'all'>('all');
  const [epicFilter, setEpicFilter] = useState<number | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<IssueCard['priority'] | 'all'>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');

  // Drag & drop + status-move rules are owned by useTicketBoard (see below),
  // shared with the board page so the two boards never diverge.

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCompleteSprintModal, setShowCompleteSprintModal] = useState(false);
  const [startSprintTarget, setStartSprintTarget] = useState<Sprint | null>(null);
  const [editEndDateOpen, setEditEndDateOpen] = useState(false);
  const [selectedStatusId, setSelectedStatusId] = useState<number | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);

  // Column collapse (persisted, separate key from Board)
  const sprintCollapseStorageKey = `sprint_collapsed_columns_${projectId}`;
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId || isNaN(projectId)) return;
    try {
      const raw = window.localStorage.getItem(sprintCollapseStorageKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          setCollapsedColumns(new Set(arr.map((v) => String(v))));
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const toggleColumnCollapsed = (statusId: number) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      const key = String(statusId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(sprintCollapseStorageKey, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Fetch data. A project can have several active sprints at once, so this
  // also decides which one the board shows (see sprint selection below).
  const fetchData = useCallback(async (desiredSprintId?: number) => {
    if (!projectId || isNaN(projectId)) {
      setError('Invalid project ID');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch active sprints, future sprints, statuses, and members
      const [fetchedActiveSprints, fetchedFutureSprints, fetchedStatuses, fetchedMembers] = await Promise.all([
        sprintsAPI.getSprints(projectId, SprintState.ACTIVE),
        sprintsAPI.getSprints(projectId, SprintState.FUTURE),
        workflowAPI.getStatuses(projectId),
        membersAPI.getMembers(projectId),
      ]);

      setActiveSprints(fetchedActiveSprints);
      setFutureSprints(fetchedFutureSprints);
      setStatuses(fetchedStatuses);
      setMembers(fetchedMembers.filter((m) => m.active !== false && m.user_id !== 0));

      // Pick which active sprint to show: an explicit request, then ?sprint=
      // from the URL, then the one already open, then the first active sprint.
      const urlSprintId = Number(searchParams.get('sprint'));
      const preferred = [desiredSprintId, urlSprintId, activeSprintIdRef.current].find(
        (id): id is number => !!id && fetchedActiveSprints.some((s) => s.id === id)
      );
      const activeSprint = fetchedActiveSprints.find((s) => s.id === preferred) || fetchedActiveSprints[0] || null;
      setActiveSprint(activeSprint);
      activeSprintIdRef.current = activeSprint?.id ?? null;

      if (activeSprint) {
        // Fetch capacity and sprint issues
        const [fetchedCapacity, sprintTickets] = await Promise.all([
          sprintsAPI.getSprintCapacity(projectId, activeSprint.id),
          ticketsAPI.getTickets(projectId, { sprint_id: activeSprint.id }),
        ]);

        setCapacity(fetchedCapacity);

        // Cards use the shared IssueCardData shape.
        setIssues(sprintTickets.map(toIssueCardData));

        // Epics for the filter dropdown — derived from the raw tickets so we keep
        // epic_name, which the shared card shape intentionally drops.
        const seenEpics = new Set<number>();
        const uniqueEpics: IssueCard[] = [];
        for (const t of sprintTickets) {
          if (t.epic_id && !seenEpics.has(t.epic_id)) {
            seenEpics.add(t.epic_id);
            uniqueEpics.push({
              id: t.id,
              key: t.key,
              title: t.title,
              type: t.type,
              statusId: t.status_id,
              epicId: t.epic_id,
              epicName: t.epic_name,
            });
          }
        }
        setEpics(uniqueEpics);
      } else {
        setCapacity(null);
        setIssues([]);
        setEpics([]);
      }
    } catch (err) {
      console.error('Failed to fetch sprint data:', err);
      setError('Failed to load sprint data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [projectId, searchParams]);

  // Switch the board to another active sprint, keeping the choice in the URL
  // so it survives refreshes and can be linked to.
  const handleSwitchSprint = useCallback((sprintId: number) => {
    if (sprintId === activeSprintIdRef.current) return;
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set('sprint', String(sprintId));
    router.replace(`${pathname}?${params.toString()}`);
    fetchData(sprintId);
  }, [searchParams, router, pathname, fetchData]);

  // Start a planned (future) sprint and open it on the board.
  // Starting a sprint time-boxes it, so open a dialog to confirm start/end dates
  // (the backend requires an end date). The modal performs the start call.
  const handleStartSprint = useCallback((sprint: Sprint) => {
    setStartSprintTarget(sprint);
  }, []);

  const confirmStartSprint = useCallback(
    async (dates: { end_date: string }) => {
      if (!startSprintTarget) return;
      await sprintsAPI.startSprint(projectId, startSprintTarget.id, dates);
      await fetchData(startSprintTarget.id);
    },
    [projectId, fetchData, startSprintTarget],
  );

  // Only global admins or admins of this project may change a sprint's end date.
  // The backend enforces the same rule; this just gates the UI.
  const canEditDates =
    isAdmin || members.some((m) => m.user_id === user?.id && (m.role === 'admin' || m.is_global_admin));

  const confirmEditEndDate = useCallback(
    async (endDate: string) => {
      if (!activeSprint) return;
      const updated = await sprintsAPI.updateSprintDates(projectId, activeSprint.id, { end_date: endDate });
      setActiveSprint(updated);
      await fetchData(activeSprint.id);
    },
    [projectId, fetchData, activeSprint],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handlers
  const handleCompleteSprint = () => {
    if (!activeSprint) return;
    setShowCompleteSprintModal(true);
  };

  const confirmCompleteSprint = async (moveToSprintId: number | null) => {
    if (!activeSprint) return;
    await sprintsAPI.completeSprint(projectId, activeSprint.id, moveToSprintId);
    fetchData();
  };

  // Drag + status-move behavior shared with the board page (one-step cap, evidence
  // gate, optimistic move, toast errors). onAfterMove refreshes the sprint so
  // capacity reflects the move. The sprint board always shows status columns, so
  // status moves are always allowed (groupBy fixed to 'none').
  const {
    draggedIssue,
    dragOverStatusId,
    doneEvidenceCtx,
    setDoneEvidenceCtx,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    submitDoneEvidence,
    isDropBlocked,
  } = useTicketBoard({
    projectId,
    statuses,
    tickets: issues,
    setTickets: setIssues,
    groupBy: 'none',
    onAfterMove: () => fetchData(),
  });

  const handleAddIssue = (statusId: number) => {
    setSelectedStatusId(statusId);
    setShowCreateModal(true);
  };

  const handleIssueCreated = () => {
    fetchData();
  };

  // Also refresh when an issue is created from the top bar (quick add, bulk import).
  useTicketsChanged(projectId, handleIssueCreated);

  // Update the active sprint's goal from the header's inline editor.
  const updateSprintGoal = async (goal: string) => {
    if (!activeSprint) return;
    try {
      await sprintsAPI.updateSprint(projectId, activeSprint.id, { goal });
      setActiveSprint({ ...activeSprint, goal });
    } catch (err) {
      console.error('Failed to update sprint goal:', err);
      alert('Failed to update sprint goal');
    }
  };

  // Filter issues
  const filteredIssues = issues
    .filter((issue) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          issue.key.toLowerCase().includes(query) ||
          issue.title.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .filter((issue) => assigneeFilter === 'all' || issue.assignee?.id === assigneeFilter)
    .filter((issue) => typeFilter === 'all' || issue.type === typeFilter)
    .filter((issue) => epicFilter === 'all' || issue.epicId === epicFilter)
    .filter((issue) => priorityFilter === 'all' || issue.priority === priorityFilter);

  // Group issues by status
  const issuesByStatus = statuses.reduce((acc, status) => {
    acc[status.id] = filteredIssues.filter((issue) => issue.statusId === status.id);
    return acc;
  }, {} as Record<number, IssueCardData[]>);

  return {
    projectId,
    loading,
    error,
    // Sprint data
    activeSprint,
    activeSprints,
    futureSprints,
    capacity,
    statuses,
    members,
    epics,
    canEditDates,
    // Filters
    searchQuery,
    setSearchQuery,
    assigneeFilter,
    setAssigneeFilter,
    typeFilter,
    setTypeFilter,
    epicFilter,
    setEpicFilter,
    priorityFilter,
    setPriorityFilter,
    groupBy,
    setGroupBy,
    // Derived board data
    issuesByStatus,
    collapsedColumns,
    toggleColumnCollapsed,
    // Modals
    showCreateModal,
    setShowCreateModal,
    showCompleteSprintModal,
    setShowCompleteSprintModal,
    startSprintTarget,
    setStartSprintTarget,
    editEndDateOpen,
    setEditEndDateOpen,
    selectedStatusId,
    setSelectedStatusId,
    selectedIssueId,
    setSelectedIssueId,
    // Handlers
    fetchData,
    handleSwitchSprint,
    handleStartSprint,
    confirmStartSprint,
    confirmEditEndDate,
    handleCompleteSprint,
    confirmCompleteSprint,
    handleAddIssue,
    handleIssueCreated,
    updateSprintGoal,
    // Board (useTicketBoard)
    draggedIssue,
    dragOverStatusId,
    doneEvidenceCtx,
    setDoneEvidenceCtx,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    submitDoneEvidence,
    isDropBlocked,
  };
}
