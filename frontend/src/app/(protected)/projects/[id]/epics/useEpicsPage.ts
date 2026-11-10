import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { epicsApi, EpicListItem } from '@/lib/api/epics';
import { membersAPI, ProjectMember } from '@/lib/api/settings';
import { ViewMode, SortField, SortDirection, statusOptions, sortOptions } from './constants';

export function useEpicsPage() {
  const params = useParams();
  const projectId = parseInt(params.id as string);

  const [epics, setEpics] = useState<EpicListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedEpicId, setSelectedEpicId] = useState<number | null>(null);

  // Filters and search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterAssignee, setFilterAssignee] = useState<number | ''>('');
  const [members, setMembers] = useState<ProjectMember[]>([]);

  // Dropdowns
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // View and sort
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [sortField, setSortField] = useState<SortField>('due_date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const loadEpics = async () => {
    try {
      const data = await epicsApi.listEpics(projectId, {
        status: filterStatus || undefined,
        assignee_id: filterAssignee || undefined,
      });
      setEpics(data);
    } catch (error) {
      console.error('Failed to load epics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    membersAPI
      .getMembers(projectId)
      .then((data) => setMembers(data.filter((m) => m.active !== false && m.user_id !== 0)))
      .catch((err) => console.error('Failed to load members:', err));
  }, [projectId]);

  const handleEpicClick = (epicId: number) => {
    setSelectedEpicId(epicId);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedEpicId(null);
  };

  useEffect(() => {
    loadEpics();
  }, [projectId, filterStatus, filterAssignee]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-dropdown]')) {
        setShowStatusDropdown(false);
        setShowAssigneeDropdown(false);
        setShowSortDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Stats calculations
  const stats = {
    total: epics.length,
    completed: epics.filter((e) => e.status === 'completed').length,
    inProgress: epics.filter((e) => e.status === 'in_progress').length,
    atRisk: epics.filter((e) => {
      if (!e.due_date) return false;
      const daysUntilDue = Math.ceil(
        (new Date(e.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysUntilDue > 0 && daysUntilDue <= 7 && e.status !== 'completed';
    }).length,
  };

  // Filter and sort epics
  const filteredEpics = epics
    .filter((epic) => {
      const q = searchQuery.toLowerCase();
      return (
        epic.title.toLowerCase().includes(q) ||
        epic.key.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'progress':
          comparison = a.progress_percentage - b.progress_percentage;
          break;
        case 'due_date':
          if (!a.due_date && !b.due_date) comparison = 0;
          else if (!a.due_date) comparison = 1;
          else if (!b.due_date) comparison = -1;
          else comparison = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          break;
        case 'assignee':
          comparison = (a.assignee?.name || '').localeCompare(b.assignee?.name || '');
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  const handleExportCSV = () => {
    if (filteredEpics.length === 0) return;
    const headers = ['Key', 'Title', 'Status', 'Assignee', 'Progress %', 'Total Tickets', 'Completed Tickets', 'Due Date'];
    const rows = filteredEpics.map((e) => [
      e.key,
      e.title,
      e.status,
      e.assignee?.name || '',
      String(e.progress_percentage ?? 0),
      String(e.total_tickets ?? 0),
      String(e.completed_tickets ?? 0),
      e.due_date || '',
    ]);
    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `epics-${Date.now()}.csv`;
    a.click();
  };

  const selectedStatusLabel = statusOptions.find((o) => o.value === filterStatus)?.label || 'All statuses';
  const selectedAssigneeName =
    filterAssignee === ''
      ? 'All assignees'
      : members.find((m) => m.user_id === filterAssignee)?.name || 'All assignees';
  const selectedSortLabel = sortOptions.find((o) => o.value === sortField)?.label || 'Due date';

  return {
    projectId,
    epics,
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
  };
}
