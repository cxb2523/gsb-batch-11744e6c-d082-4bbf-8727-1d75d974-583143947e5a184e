import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTicketsChanged } from '@/lib/ticketEvents';
import { ticketsAPI, TicketBulkUpdateFields, TicketFilters } from '../../../../../lib/api/tickets';
import { sprintsAPI, Sprint, SprintState } from '../../../../../lib/api/sprints';
import { membersAPI, ProjectMember, workflowAPI, WorkflowStatus, labelsAPI, Label } from '../../../../../lib/api/settings';
import { epicsApi, EpicListItem } from '../../../../../lib/api/epics';
import { BacklogTicket, SprintWithCapacity } from './types';
import { BACKLOG_PAGE_SIZE } from './constants';

export function useBacklog() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = parseInt(params.id as string);

  const [tickets, setTickets] = useState<BacklogTicket[]>([]);
  // Backlog pagination: one page at a time with Previous/Next. `cursorStackRef`
  // holds the cursor used to fetch each page index (bookkeeping, not render
  // state); `nextCursor` is the current page's forward cursor, `total` the count.
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const cursorStackRef = React.useRef<(string | null)[]>([null]);
  const [total, setTotal] = useState(0);
  const [sprintTickets, setSprintTickets] = useState<Map<number, BacklogTicket[]>>(new Map());
  const [sprints, setSprints] = useState<SprintWithCapacity[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [epicsList, setEpicsList] = useState<EpicListItem[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // The two collapsible top-level sections in the left pane.
  const [epicsOpen, setEpicsOpen] = useState(true);
  const [ticketsOpen, setTicketsOpen] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateSprintModal, setShowCreateSprintModal] = useState(false);
  const [completingSprint, setCompletingSprint] = useState<SprintWithCapacity | null>(null);
  const [startSprintTarget, setStartSprintTarget] = useState<Sprint | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [draggedTicket, setDraggedTicket] = useState<BacklogTicket | null>(null);
  const [dragOverSprint, setDragOverSprint] = useState<number | null>(null);
  const [editingStoryPoints, setEditingStoryPoints] = useState<number | null>(null);
  const [expandedSprints, setExpandedSprints] = useState<Set<number>>(new Set());

  // Filter state
  const [assigneeFilter, setAssigneeFilter] = useState<number | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<string | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<string | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<number | 'all'>('all');
  const [epicFilter, setEpicFilter] = useState<number | 'all'>('all');

  // Search is sent to the server as `q`; debounce so each keystroke doesn't refetch.
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Dropdown open state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-backlog-dropdown]')) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Check for ticketId in query params
  useEffect(() => {
    const ticketIdParam = searchParams.get('ticketId');
    if (ticketIdParam) {
      const ticketId = parseInt(ticketIdParam);
      if (!isNaN(ticketId)) {
        setSelectedTicketId(ticketId);
        const url = new URL(window.location.href);
        url.searchParams.delete('ticketId');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [searchParams]);

  // The toolbar filters, mapped to server query params for the backlog stream.
  // `no_sprint` selects the backlog set (tickets in no sprint). Everything here
  // is applied server-side, so the page never has to hold the whole project.
  const serverFilters = useCallback((): TicketFilters => {
    const f: TicketFilters = { no_sprint: true };
    if (assigneeFilter !== 'all') f.assignee_id = assigneeFilter;
    if (typeFilter !== 'all') f.type = typeFilter;
    if (priorityFilter !== 'all') f.priority = priorityFilter;
    if (statusFilter !== 'all') f.status_id = statusFilter;
    if (epicFilter !== 'all') f.epic_id = epicFilter;
    if (debouncedSearch.trim()) f.q = debouncedSearch.trim();
    return f;
  }, [assigneeFilter, typeFilter, priorityFilter, statusFilter, epicFilter, debouncedSearch]);

  // Load a single page of backlog tickets (Previous/Next navigation). `index` is
  // the 0-based page; the cursor that fetches it is kept in cursorStackRef. The
  // forward cursor returned for the following page is recorded as we go.
  const loadPage = useCallback(async (index: number) => {
    if (!projectId || isNaN(projectId)) {
      setError('Invalid project ID');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const cursor = cursorStackRef.current[index] ?? undefined;
      const page = await ticketsAPI.getTicketsPage(projectId, {
        ...serverFilters(),
        limit: BACKLOG_PAGE_SIZE,
        cursor,
      });
      setTickets(page.items);
      setTotal(page.total);
      setNextCursor(page.next_cursor);
      if (page.next_cursor) cursorStackRef.current[index + 1] = page.next_cursor;
      setPageIndex(index);
    } catch (err) {
      console.error('Failed to load backlog:', err);
      setError('Failed to load backlog. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [projectId, serverFilters]);

  const goToNextPage = useCallback(() => {
    if (!nextCursor || loading) return;
    loadPage(pageIndex + 1);
  }, [nextCursor, loading, pageIndex, loadPage]);

  const goToPrevPage = useCallback(() => {
    if (pageIndex === 0 || loading) return;
    loadPage(pageIndex - 1);
  }, [pageIndex, loading, loadPage]);

  // Fetch one sprint's tickets on demand (when its row is expanded). Sprint
  // ticket lists are naturally small, so each is a single scoped request rather
  // than part of the backlog stream.
  const loadSprintTickets = useCallback(async (sprintId: number) => {
    try {
      const rows = await ticketsAPI.getTickets(projectId, { sprint_id: sprintId });
      setSprintTickets((prev) => {
        const next = new Map(prev);
        next.set(sprintId, rows);
        return next;
      });
    } catch (err) {
      console.error(`Failed to load tickets for sprint ${sprintId}:`, err);
    }
  }, [projectId]);

  // Project reference data + sprints with capacity. Returns the active sprint
  // ids so the caller can auto-expand (and load) them.
  const loadReference = useCallback(async (): Promise<number[]> => {
    const [fetchedMembers, fetchedSprints, fetchedStatuses, fetchedEpics, fetchedLabels] = await Promise.all([
      membersAPI.getMembers(projectId),
      sprintsAPI.getSprints(projectId),
      workflowAPI.getStatuses(projectId).catch(() => [] as WorkflowStatus[]),
      epicsApi.listEpics(projectId).catch(() => [] as EpicListItem[]),
      labelsAPI.getLabels(projectId).catch(() => [] as Label[]),
    ]);

    setMembers(fetchedMembers.filter(m => m.active !== false && m.user_id !== 0));
    setStatuses(fetchedStatuses);
    setEpicsList(fetchedEpics);
    setLabels(fetchedLabels);

    // Fetch capacity for each sprint
    const sprintsWithCapacity = await Promise.all(
      fetchedSprints.map(async (sprint) => {
        try {
          const capacity = await sprintsAPI.getSprintCapacity(projectId, sprint.id);
          return { ...sprint, capacity };
        } catch (err) {
          console.error(`Failed to fetch capacity for sprint ${sprint.id}:`, err);
          return sprint;
        }
      })
    );
    setSprints(sprintsWithCapacity);

    return sprintsWithCapacity
      .filter(s => s.state === SprintState.ACTIVE)
      .map(s => s.id);
  }, [projectId]);

  // Initial load: reference data + sprints, then auto-expand and load the
  // active sprints. The first backlog page is loaded by the filter effect below.
  useEffect(() => {
    if (!projectId || isNaN(projectId)) return;
    let cancelled = false;
    (async () => {
      const activeIds = await loadReference();
      if (cancelled || activeIds.length === 0) return;
      setExpandedSprints(new Set(activeIds));
      activeIds.forEach(loadSprintTickets);
    })();
    return () => { cancelled = true; };
  }, [projectId, loadReference, loadSprintTickets]);

  // (Re)load from the first page whenever the filters or debounced search change
  // (and once on mount). Reset the cursor stack since the result set changed.
  useEffect(() => {
    cursorStackRef.current = [null];
    loadPage(0);
  }, [loadPage]);

  // Debounce the search box before it becomes a server query.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // After a mutation (drag to sprint, bulk edit, create, story-point edit),
  // reload the backlog's first page, refresh sprint capacities, and re-fetch
  // tickets for every sprint currently expanded.
  const refreshAll = useCallback(async () => {
    const [activeIds] = await Promise.all([
      loadReference(),
      loadPage(pageIndex),
      ...Array.from(expandedSprints).map(loadSprintTickets),
    ]);
    // Keep active sprints expanded and loaded (e.g. one was just started),
    // without collapsing the sprints the user expanded by hand.
    const toExpand = activeIds.filter((id) => !expandedSprints.has(id));
    if (toExpand.length > 0) {
      setExpandedSprints((prev) => {
        const next = new Set(prev);
        toExpand.forEach((id) => next.add(id));
        return next;
      });
      toExpand.forEach(loadSprintTickets);
    }
  }, [loadPage, pageIndex, loadReference, expandedSprints, loadSprintTickets]);

  // Also refresh when an issue is created from the top bar (quick add, bulk import).
  useTicketsChanged(projectId, refreshAll);

  const toggleSprint = (sprintId: number) => {
    setExpandedSprints(prev => {
      const next = new Set(prev);
      if (next.has(sprintId)) {
        next.delete(sprintId);
      } else {
        next.add(sprintId);
        // Load the sprint's tickets the first time it's opened.
        if (!sprintTickets.has(sprintId)) loadSprintTickets(sprintId);
      }
      return next;
    });
  };

  // Flat ordered list of currently visible backlog ticket ids (post-filter/sort, in render order)
  const visibleTicketIdsRef = React.useRef<number[]>([]);

  // Look up any backlog/sprint ticket (and its children) by id, so the bulk bar can
  // read each selected ticket's status for the one-step transition cap.
  const ticketById = React.useMemo(() => {
    const map = new Map<number, BacklogTicket>();
    const add = (t: BacklogTicket) => {
      map.set(t.id, t);
      t.children?.forEach(add);
    };
    tickets.forEach(add);
    sprintTickets.forEach((list) => list.forEach(add));
    return map;
  }, [tickets, sprintTickets]);

  const handleToggleSelect = (ticketId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastSelectedId !== null && lastSelectedId !== ticketId) {
        const ordered = visibleTicketIdsRef.current;
        const startIdx = ordered.indexOf(lastSelectedId);
        const endIdx = ordered.indexOf(ticketId);
        if (startIdx !== -1 && endIdx !== -1) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          for (let i = from; i <= to; i++) next.add(ordered[i]);
        } else {
          if (next.has(ticketId)) next.delete(ticketId);
          else next.add(ticketId);
        }
      } else {
        if (next.has(ticketId)) next.delete(ticketId);
        else next.add(ticketId);
      }
      return next;
    });
    setLastSelectedId(ticketId);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  };

  const applyBulkUpdate = async (updates: TicketBulkUpdateFields) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const result = await ticketsAPI.bulkUpdate(projectId, {
        ticket_numbers: ids,
        updates,
      });
      clearSelection();
      await refreshAll();
      if (result.errors.length > 0) {
        // Some tickets were skipped server-side (e.g. can't go Done without an MR
        // link or comment). Surface the reason rather than silently succeeding.
        alert(
          `${result.updated} updated. ${result.errors.length} skipped — ${result.errors[0].error}`
        );
      }
    } catch (err) {
      console.error('Bulk update failed:', err);
      alert('Bulk update failed. Please try again.');
    }
  };

  const handleDragStart = (ticket: BacklogTicket) => {
    setDraggedTicket(ticket);
  };

  const handleDragEnd = () => {
    setDraggedTicket(null);
    setDragOverSprint(null);
  };

  const handleDragOver = (e: React.DragEvent, sprintId: number) => {
    e.preventDefault();
    setDragOverSprint(sprintId);
  };

  const handleDragLeave = () => {
    setDragOverSprint(null);
  };

  const handleDrop = async (e: React.DragEvent, sprintId: number) => {
    e.preventDefault();
    if (!draggedTicket) return;

    try {
      // Update ticket with sprint_id
      await ticketsAPI.updateTicket(projectId, draggedTicket.id, {
        sprint_id: sprintId,
      });

      // Refresh data
      await refreshAll();
    } catch (err) {
      console.error('Failed to move ticket to sprint:', err);
      alert('Failed to move ticket. Please try again.');
    } finally {
      setDraggedTicket(null);
      setDragOverSprint(null);
    }
  };

  const handleStoryPointsUpdate = async (ticketId: number, storyPoints: number | null) => {
    try {
      await ticketsAPI.updateTicket(projectId, ticketId, {
        story_points: storyPoints,
      });
      await refreshAll();
    } catch (err) {
      console.error('Failed to update story points:', err);
      alert('Failed to update story points. Please try again.');
    } finally {
      setEditingStoryPoints(null);
    }
  };

  const handleCreateSprint = () => {
    setShowCreateSprintModal(true);
  };

  // Starting a sprint time-boxes it, so open a dialog to confirm start/end dates
  // (the backend requires an end date). The modal performs the start call.
  const handleStartSprint = (sprint: Sprint) => {
    setStartSprintTarget(sprint);
  };

  const confirmStartSprint = async (dates: { end_date: string }) => {
    if (!startSprintTarget) return;
    await sprintsAPI.startSprint(projectId, startSprintTarget.id, dates);
    await refreshAll();
  };

  const handleCompleteSprint = (sprintId: number) => {
    const sprint = sprints.find((s) => s.id === sprintId);
    if (sprint) {
      setCompletingSprint(sprint);
    }
  };

  const confirmCompleteSprint = async (moveToSprintId: number | null) => {
    if (!completingSprint) return;
    await sprintsAPI.completeSprint(projectId, completingSprint.id, moveToSprintId);
    await refreshAll();
  };

  // Epics are project reference data loaded once (unfiltered), so the toolbar
  // filters the ticket stream already respects have to be re-applied to them
  // here - otherwise the Epics section ignores every filter. Only the filters
  // that are meaningful for an epic narrow the list:
  //  - assignee: epics carry an assignee_id, so match it directly.
  //  - epic: when a single epic is picked, show just that one.
  //  - type: epics belong under "All types" or the "Epic" type; any other
  //    ticket type (task/bug/story/subtask) excludes them.
  //  - priority / status: ticket-only concepts an epic can never carry, so any
  //    specific choice empties the Epics section.
  //  - search: matches the epic key or title, like the stream's `q`.
  const filteredEpics = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return epicsList.filter((epic) => {
      if (assigneeFilter !== 'all' && epic.assignee_id !== assigneeFilter) return false;
      if (epicFilter !== 'all' && epic.id !== epicFilter) return false;
      if (typeFilter !== 'all' && typeFilter !== 'epic') return false;
      if (priorityFilter !== 'all') return false;
      if (statusFilter !== 'all') return false;
      if (q && !epic.key.toLowerCase().includes(q) && !epic.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [epicsList, assigneeFilter, epicFilter, typeFilter, priorityFilter, statusFilter, debouncedSearch]);

  // Separate sprints by state. A project can run several active sprints at once.
  const activeSprints = sprints.filter(s => s.state === SprintState.ACTIVE);
  const futureSprints = sprints.filter(s => s.state === SprintState.FUTURE);
  const closedSprints = sprints.filter(s => s.state === SprintState.CLOSED);

  // Flat list of visible ticket ids in render order for shift-click selection.
  visibleTicketIdsRef.current = ticketsOpen ? tickets.map((t) => t.id) : [];

  const totalPages = Math.max(1, Math.ceil(total / BACKLOG_PAGE_SIZE));

  return {
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
    loadSprintTickets,
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
  };
}
