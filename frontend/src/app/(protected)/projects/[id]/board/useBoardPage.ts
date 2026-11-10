import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation';
import { workflowAPI, WorkflowStatus, membersAPI, ProjectMember, labelsAPI, Label } from '../../../../../lib/api/settings';
import { useTicketsChanged } from '@/lib/ticketEvents';
import { PRIORITY_OPTIONS } from '@/lib/priority';
import { ticketsAPI } from '../../../../../lib/api/tickets';
import { boardAPI, type BoardData, type BoardGroupBy, type BoardQuery } from '../../../../../lib/api/board';
import { sprintsAPI, Sprint } from '../../../../../lib/api/sprints';
import { epicsApi, EpicListItem } from '../../../../../lib/api/epics';
import { IssueCardData } from '../../../../../components/board/IssueCard';
import { toIssueCardData } from '../../../../../lib/boardCard';
import { useTicketBoard } from '../../../../../hooks/useTicketBoard';
import { useToast } from '../../../../../components/ui';
import {
  BoardFilters,
  DEFAULT_BOARD_FILTERS,
  parseBoardFilters,
  applyBoardFilters,
  countActiveFilters,
  hasFilterParams,
  boardFiltersStorageKey,
} from '../../../../../lib/boardFilters';
import { useAuth } from '../../../../../hooks/useAuth';
import type { TicketBulkUpdateFields, TicketDeleteImpact } from '../../../../../lib/api/tickets';
import { getGroupColumns, groupTickets } from './boardGrouping';

/** Cards per column on the first load, and per "Load more" after it. */
const COLUMN_PAGE_SIZE = 50;

export function useBoardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const projectId = parseInt(params.id as string);
  const { user, isAdmin } = useAuth();
  const toast = useToast();

  // State
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [tickets, setTickets] = useState<IssueCardData[]>([]);
  // Per column: how many cards it holds, and where to resume it. The cards
  // themselves stay in the flat `tickets` list above, which the drag handlers,
  // bulk actions and the shared board hook all work from - grouping them for
  // display is cheap and keeps one source of truth for a card.
  const [columnTotals, setColumnTotals] = useState<Record<string, number>>({});
  const [columnCursors, setColumnCursors] = useState<Record<string, string | null>>({});
  const [loadingColumn, setLoadingColumn] = useState<string | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [epics, setEpics] = useState<EpicListItem[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [boardSprints, setBoardSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Board settings
  const [boardName, setBoardName] = useState('Kanban Board');
  const [isEditingName, setIsEditingName] = useState(false);

  // Filters live in the URL, so a filtered board is shareable as a link and the back
  // button works. Nothing is mirrored into React state - the query string is the truth.
  const filters = useMemo(
    () => parseBoardFilters(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );
  const {
    search: searchQuery,
    assignee: assigneeFilter,
    type: typeFilter,
    epic: epicFilter,
    priority: priorityFilter,
    label: labelFilter,
    sprint: sprintFilter,
    groupBy,
    showArchived,
  } = filters;

  const activeFilterCount = countActiveFilters(filters);

  // The filters, as the server takes them. "all" means the filter is off, so it
  // is left out rather than sent as a value meaning everything.
  const boardQuery: BoardQuery = useMemo(() => ({
    group_by: (groupBy === 'none' ? 'status' : groupBy) as BoardGroupBy,
    column_limit: COLUMN_PAGE_SIZE,
    assignee_id: assigneeFilter === 'all' ? undefined : assigneeFilter,
    type: typeFilter === 'all' ? undefined : typeFilter,
    epic_id: epicFilter === 'all' ? undefined : epicFilter,
    priority: priorityFilter === 'all' ? undefined : priorityFilter,
    label: labelFilter === 'all' ? undefined : labelFilter,
    sprint_id: sprintFilter === 'all' ? undefined : sprintFilter,
    q: searchQuery.trim() || undefined,
    include_archived: showArchived,
  }), [groupBy, assigneeFilter, typeFilter, epicFilter, priorityFilter, labelFilter, sprintFilter, searchQuery, showArchived]);

  // What the refetch effect watches. The object above is rebuilt on every render
  // that touches members, which is not a reason to go back to the server.
  const boardQueryKey = JSON.stringify(boardQuery);

  const writeFilters = React.useCallback(
    (next: BoardFilters) => {
      const params = applyBoardFilters(next, new URLSearchParams(searchParams.toString()));
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });

      // Remember the last-used filters so returning with a bare URL restores them.
      try {
        window.localStorage.setItem(
          boardFiltersStorageKey(projectId),
          applyBoardFilters(next).toString()
        );
      } catch {
        // ignore
      }
    },
    [router, pathname, searchParams, projectId]
  );

  const setFilter = React.useCallback(
    <K extends keyof BoardFilters>(key: K, value: BoardFilters[K]) => {
      writeFilters({ ...filters, [key]: value });
    },
    [filters, writeFilters]
  );

  const clearFilters = React.useCallback(() => {
    // Keeps groupBy and showArchived: they aren't filters, and silently resetting the
    // user's grouping when they clear filters would be surprising.
    writeFilters({ ...DEFAULT_BOARD_FILTERS, groupBy: filters.groupBy, showArchived: filters.showArchived });
  }, [filters, writeFilters]);

  // The search box stays local and pushes to the URL on a debounce - writing a router
  // update on every keystroke would make typing feel laggy on a busy board.
  const [searchDraft, setSearchDraft] = useState(searchQuery);

  useEffect(() => {
    // Keep in step when the URL changes from elsewhere (chip removed, Clear all, back).
    setSearchDraft(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (searchDraft === searchQuery) return;
    const timer = window.setTimeout(() => setFilter('search', searchDraft), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  // On first load with a bare URL, restore the last-used filters for this project.
  const didRestoreFilters = useRef(false);
  useEffect(() => {
    if (didRestoreFilters.current || !projectId || isNaN(projectId)) return;
    didRestoreFilters.current = true;

    if (hasFilterParams(new URLSearchParams(searchParams.toString()))) return; // URL wins

    try {
      const saved = window.localStorage.getItem(boardFiltersStorageKey(projectId));
      if (!saved) return;
      const restored = parseBoardFilters(new URLSearchParams(saved));
      const query = applyBoardFilters(restored, new URLSearchParams(searchParams.toString())).toString();
      if (query) router.replace(`${pathname}?${query}`, { scroll: false });
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedStatusId, setSelectedStatusId] = useState<number | null>(null);

  // The open ticket modal is driven by the ?ticketId= query param so a ticket is
  // deep-linkable: clicking a card pushes the id into the URL, closing removes it, and
  // the browser Back button closes the modal. The query string is the single source of
  // truth here - nothing is mirrored into React state (same approach as the filters above).
  const selectedTicketId = useMemo(() => {
    const raw = searchParams.get('ticketId');
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
  }, [searchParams]);

  const openTicket = React.useCallback(
    (ticketId: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('ticketId', String(ticketId));
      // push (not replace) so the browser Back button closes the modal.
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const closeTicket = React.useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('ticketId');
    const query = params.toString();
    // replace so closing doesn't leave a forward entry that Back would use to reopen.
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  // Drag & drop + status-move rules (shared with the sprint board via this hook).
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
    tickets,
    setTickets,
    groupBy,
    onAfterMove: ({ fromStatusId, toStatusId }) => {
      // Column counts come from the server, so a card moving between columns
      // has to be reflected here or the headers drift. Only status grouping
      // puts the card in a different column; under the others it stays put.
      if (boardQuery.group_by !== 'status' || fromStatusId === toStatusId) return;
      setColumnTotals((prev) => ({
        ...prev,
        ...(fromStatusId !== undefined
          ? { [String(fromStatusId)]: Math.max(0, (prev[String(fromStatusId)] ?? 1) - 1) }
          : {}),
        [String(toStatusId)]: (prev[String(toStatusId)] ?? 0) + 1,
      }));
    },
  });

  // Multi-select
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<number>>(new Set());
  const [lastSelectedTicketId, setLastSelectedTicketId] = useState<number | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Single-issue delete, launched from a card's "..." menu
  const [cardDeleteId, setCardDeleteId] = useState<number | null>(null);
  const [cardDeleteImpact, setCardDeleteImpact] = useState<TicketDeleteImpact | null>(null);
  const [cardDeleting, setCardDeleting] = useState(false);

  // Column collapse state (persisted to localStorage)
  const collapseStorageKey = `board_collapsed_columns_${projectId}`;
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId || isNaN(projectId)) return;
    try {
      const raw = window.localStorage.getItem(collapseStorageKey);
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

  const persistCollapsed = (next: Set<string>) => {
    try {
      window.localStorage.setItem(collapseStorageKey, JSON.stringify(Array.from(next)));
    } catch {
      // ignore
    }
  };

  const toggleColumnCollapsed = (columnId: string) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      persistCollapsed(next);
      return next;
    });
  };

  // ---- Card "..." menu actions ----

  const assignToMe = async (ticketId: number) => {
    if (!user) return;
    try {
      await ticketsAPI.updateTicket(projectId, ticketId, { assignee_email: user.email });
      await handleIssueCreated();
      toast.success('Assigned to you');
    } catch (err) {
      console.error('Assign to me failed:', err);
      toast.error(err instanceof Error ? err.message : 'Could not assign the issue.');
    }
  };

  const copyIssueLink = async (ticketId: number) => {
    // ?ticketId= is already handled on load and opens the issue directly.
    const url = `${window.location.origin}/projects/${projectId}/board?ticketId=${ticketId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  const toggleArchiveIssue = async (ticketId: number, archived: boolean) => {
    try {
      if (archived) await ticketsAPI.unarchiveTicket(projectId, ticketId);
      else await ticketsAPI.archiveTicket(projectId, ticketId);
      await handleIssueCreated();

      // Archiving is reversible, so offer the undo instead of a confirmation dialog.
      toast.success(archived ? 'Issue restored' : 'Issue archived', {
        label: 'Undo',
        run: () => toggleArchiveIssue(ticketId, !archived),
      });
    } catch (err) {
      console.error('Archive toggle failed:', err);
      toast.error(err instanceof Error ? err.message : 'Could not archive the issue.');
    }
  };

  // Delete from a card: same impact-aware confirmation as the detail modal.
  const openCardDelete = async (ticketId: number) => {
    setCardDeleteId(ticketId);
    setCardDeleteImpact(null);
    try {
      setCardDeleteImpact(await ticketsAPI.getDeleteImpact(projectId, ticketId));
    } catch {
      // fall back to the generic warning rather than blocking
    }
  };

  const confirmCardDelete = async () => {
    if (cardDeleteId === null) return;
    setCardDeleting(true);
    try {
      await ticketsAPI.deleteTicket(projectId, cardDeleteId);
      setCardDeleteId(null);
      await handleIssueCreated();
      toast.success('Issue deleted');
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error(err instanceof Error ? err.message : 'Could not delete the issue.');
    } finally {
      setCardDeleting(false);
    }
  };

  const handleToggleSelect = (
    ticketId: number,
    e: React.MouseEvent,
    columnTickets: IssueCardData[]
  ) => {
    setSelectedTicketIds((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastSelectedTicketId !== null && lastSelectedTicketId !== ticketId) {
        // Shift-click bulk-select within the same column if both anchors are in it.
        const idsInColumn = columnTickets.map((t) => t.id);
        const startIdx = idsInColumn.indexOf(lastSelectedTicketId);
        const endIdx = idsInColumn.indexOf(ticketId);
        if (startIdx !== -1 && endIdx !== -1) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          for (let i = from; i <= to; i++) {
            next.add(idsInColumn[i]);
          }
        } else {
          // Fall back to single toggle
          if (next.has(ticketId)) next.delete(ticketId);
          else next.add(ticketId);
        }
      } else {
        if (next.has(ticketId)) next.delete(ticketId);
        else next.add(ticketId);
      }
      return next;
    });
    setLastSelectedTicketId(ticketId);
  };

  const clearSelection = () => {
    setSelectedTicketIds(new Set());
    setLastSelectedTicketId(null);
  };

  const applyBulkUpdate = async (updates: TicketBulkUpdateFields) => {
    const ids = Array.from(selectedTicketIds);
    if (ids.length === 0) return;
    try {
      const result = await ticketsAPI.bulkUpdate(projectId, {
        ticket_numbers: ids,
        updates,
      });
      clearSelection();
      await handleIssueCreated();
      if (result.errors.length > 0) {
        // Some tickets were skipped server-side (e.g. can't go Done without an MR
        // link or comment). Surface the reason rather than reporting a clean success.
        toast.error(
          `${result.updated} updated. ${result.errors.length} skipped — ${result.errors[0].error}`
        );
      } else {
        toast.success(`${ids.length} issue${ids.length === 1 ? '' : 's'} updated`);
      }
    } catch (err) {
      console.error('Bulk update failed:', err);
      toast.error('Bulk update failed. Please try again.');
    }
  };

  // Archive reuses the bulk_update endpoint; the backend takes subtasks along with it.
  const archiveSelected = async () => {
    await applyBulkUpdate({ archived: true });
  };

  const deleteSelected = async () => {
    const ids = Array.from(selectedTicketIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const result = await ticketsAPI.bulkDelete(projectId, ids);
      if (result.errors.length > 0) {
        // Deletion is reporter-or-admin only, so a partial success must be surfaced.
        toast.error(
          `Deleted ${result.deleted}. ${result.errors.length} could not be deleted (only the reporter or an admin can).`
        );
      } else {
        toast.success(`${result.deleted} issue${result.deleted === 1 ? '' : 's'} deleted`);
      }
      setShowBulkDeleteConfirm(false);
      clearSelection();
      await handleIssueCreated();
    } catch (err) {
      console.error('Bulk delete failed:', err);
      toast.error('Bulk delete failed. Please try again.');
    } finally {
      setBulkDeleting(false);
    }
  };

  // Fetch statuses, tickets, members, and epics
  useEffect(() => {
    if (!projectId || isNaN(projectId)) {
      setError('Invalid project ID');
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // The board's cards, plus the things its columns and filter menus are
        // built from. Only the cards depend on the filters; the rest describe the
        // project and are re-read only when the project changes.
        const [fetchedStatuses, board, fetchedMembers, fetchedEpics, fetchedLabels, fetchedSprints] = await Promise.all([
          workflowAPI.getStatuses(projectId),
          boardAPI.getBoard(projectId, boardQuery),
          membersAPI.getMembers(projectId),
          epicsApi.listEpics(projectId).catch(() => []),
          labelsAPI.getLabels(projectId).catch(() => [] as Label[]),
          sprintsAPI.getSprints(projectId).catch(() => [] as Sprint[]),
        ]);

        setStatuses(fetchedStatuses);
        setMembers(fetchedMembers.filter((m) => m.active !== false && m.user_id !== 0));
        setEpics(fetchedEpics);
        setLabels(fetchedLabels);
        setBoardSprints(fetchedSprints);
        applyBoard(board);
      } catch (err) {
        console.error('Failed to fetch board data:', err);
        setError('Failed to load board data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // showArchived is deliberately not a dep: toggling it only needs the tickets refetched,
    // not statuses/members/epics/labels/sprints as well (see the effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Every filter, the grouping and the archived toggle are now part of the
  // query, so any change to them means asking the server again rather than
  // re-filtering what is already here. The first load is handled above.
  const didInitialLoad = useRef(false);
  useEffect(() => {
    if (!didInitialLoad.current) {
      didInitialLoad.current = true;
      return;
    }
    void refreshBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardQueryKey]);

  /** Spread a board response into the flat card list plus the per-column bookkeeping. */
  const applyBoard = React.useCallback((board: BoardData) => {
    setTickets(board.columns.flatMap((column) => column.items.map(toIssueCardData)));
    setColumnTotals(Object.fromEntries(board.columns.map((c) => [c.key, c.total])));
    setColumnCursors(Object.fromEntries(board.columns.map((c) => [c.key, c.next_cursor])));
  }, []);

  /**
   * Fetch the cards again for the current filters. Called when a filter changes
   * and after anything that edits an issue: a card may have moved column, left
   * the filtered set, or changed a count.
   */
  const refreshBoard = React.useCallback(async () => {
    try {
      applyBoard(await boardAPI.getBoard(projectId, boardQuery));
    } catch (err) {
      console.error('Failed to refresh board:', err);
    }
  }, [projectId, boardQuery, applyBoard]);

  /**
   * Re-read the project's epics so the Epic filter/group menu picks up one that was
   * just created (as an epic issue) without a full page reload.
   */
  const refreshEpics = React.useCallback(async () => {
    try {
      setEpics(await epicsApi.listEpics(projectId));
    } catch (err) {
      console.error('Failed to refresh epics:', err);
    }
  }, [projectId]);

  /**
   * The filter that selects one column, in the ticket list's terms. The board
   * endpoint grouped the cards; continuing a column means asking the flat list
   * for that group, so the grouping has to be expressible as a filter.
   */
  const columnFilterFor = (columnKey: string) => {
    const by = boardQuery.group_by;
    if (by === 'status') return { status_id: Number(columnKey) };
    if (by === 'epic') return columnKey === 'no-epic' ? { no_epic: true } : { epic_id: Number(columnKey) };
    if (by === 'priority') return columnKey === 'no-priority' ? {} : { priority: columnKey };
    // Assignee: the column is a person, and the server takes their id.
    return columnKey === 'unassigned' ? {} : { assignee_id: Number(columnKey) };
  };

  /** The board's own filters, minus the one the column itself stands for. */
  const ticketFiltersFromBoardQuery = (query: BoardQuery) => ({
    assignee_id: query.assignee_id,
    epic_id: query.epic_id,
    priority: query.priority,
    type: query.type,
    label: query.label,
    sprint_id: query.sprint_id,
    q: query.q,
    include_archived: query.include_archived,
  });

  /** One column's next cards, continued from the cursor the board gave us. */
  const loadMoreInColumn = async (columnKey: string) => {
    const cursor = columnCursors[columnKey];
    if (!cursor || loadingColumn) return;
    setLoadingColumn(columnKey);
    try {
      const page = await ticketsAPI.getTicketsPage(projectId, {
        ...columnFilterFor(columnKey),
        ...ticketFiltersFromBoardQuery(boardQuery),
        limit: COLUMN_PAGE_SIZE,
        cursor,
      });
      setTickets((prev) => {
        // A refresh may have landed while this was in flight; don't duplicate.
        const known = new Set(prev.map((t) => t.id));
        return [...prev, ...page.items.filter((t) => !known.has(t.id)).map(toIssueCardData)];
      });
      setColumnCursors((prev) => ({ ...prev, [columnKey]: page.next_cursor }));
    } catch (err) {
      console.error('Failed to load more issues:', err);
      toast.error('Could not load more issues.');
    } finally {
      setLoadingColumn(null);
    }
  };

  const handleIssueCreated = async () => {
    // Refresh the epics list too: a new epic must appear in the Epic menu at once.
    await Promise.all([refreshBoard(), refreshEpics()]);
  };

  // Issues can be created from the top bar (quick add, bulk import), which lives
  // above this page and cannot call into it directly.
  useTicketsChanged(projectId, handleIssueCreated);

  const handleAddIssue = (statusId: number) => {
    setSelectedStatusId(statusId);
    setShowCreateModal(true);
  };

  // The cards here are already the filtered set: the query above asked for it,
  // so a match in a column that isn't on screen is found, which filtering a
  // page in the browser could never do.
  const filteredTickets = tickets;

  const groupColumns = getGroupColumns(groupBy, statuses, members, epics);
  const groupedTickets = groupTickets(groupBy, groupColumns, filteredTickets);

  // Prepare filter options
  const assigneeOptions = members.map((m) => ({ id: m.user_id, name: m.name }));

  const typeOptions = [
    { id: 'task', name: 'Task' },
    { id: 'bug', name: 'Bug' },
    { id: 'story', name: 'Story' },
    { id: 'epic', name: 'Epic' },
  ];

  const epicOptions = epics.map((e) => ({ id: e.id, name: e.title }));
  const priorityOptions = PRIORITY_OPTIONS.map((o) => ({ id: o.value, name: o.label }));
  const labelOptions = labels.map((l) => ({ id: l.name, name: l.name }));
  const sprintOptions = boardSprints.map((s) => ({ id: s.id, name: s.name }));

  // The current user as a member of *this* project (absent for a non-member admin).
  const currentMember = user ? members.find((m) => m.email === user.email) : undefined;
  const cardDeleteTicket = tickets.find((t) => t.id === cardDeleteId);

  return {
    // meta / status
    projectId,
    user,
    isAdmin,
    loading,
    error,
    statuses,
    members,
    labels,
    epics,
    boardSprints,
    tickets,
    // board name
    boardName,
    setBoardName,
    isEditingName,
    setIsEditingName,
    // filters
    filters,
    assigneeFilter,
    typeFilter,
    epicFilter,
    priorityFilter,
    labelFilter,
    sprintFilter,
    groupBy,
    showArchived,
    activeFilterCount,
    setFilter,
    clearFilters,
    searchDraft,
    setSearchDraft,
    // options
    assigneeOptions,
    typeOptions,
    epicOptions,
    priorityOptions,
    labelOptions,
    sprintOptions,
    // grouping / columns
    filteredTickets,
    groupColumns,
    groupedTickets,
    columnTotals,
    columnCursors,
    loadingColumn,
    loadMoreInColumn,
    collapsedColumns,
    toggleColumnCollapsed,
    // ticket modal
    selectedTicketId,
    openTicket,
    closeTicket,
    // create modal
    showCreateModal,
    setShowCreateModal,
    selectedStatusId,
    setSelectedStatusId,
    handleAddIssue,
    handleIssueCreated,
    // drag/drop (shared hook)
    draggedIssue,
    dragOverStatusId,
    isDropBlocked,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    doneEvidenceCtx,
    setDoneEvidenceCtx,
    submitDoneEvidence,
    // multi-select + bulk
    selectedTicketIds,
    handleToggleSelect,
    clearSelection,
    applyBulkUpdate,
    archiveSelected,
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
    deleteSelected,
    bulkDeleting,
    // card menu actions
    assignToMe,
    copyIssueLink,
    toggleArchiveIssue,
    openCardDelete,
    cardDeleteId,
    setCardDeleteId,
    cardDeleteImpact,
    cardDeleting,
    confirmCardDelete,
    cardDeleteTicket,
    currentMember,
  };
}
