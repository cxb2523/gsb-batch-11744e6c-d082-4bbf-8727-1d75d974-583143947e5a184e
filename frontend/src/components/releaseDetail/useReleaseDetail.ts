import { useState, useEffect } from 'react';
import { getRelease, getReleaseTickets, updateRelease, deleteRelease, createDeployment, Release, ReleaseTicket, DeploymentCreateData } from '@/lib/api/releases';
import { Tab } from './constants';

interface UseReleaseDetailParams {
  isOpen: boolean;
  projectId: number;
  releaseId: number;
  onReleaseUpdated?: () => void;
  onClose: () => void;
}

export function useReleaseDetail({ isOpen, projectId, releaseId, onReleaseUpdated, onClose }: UseReleaseDetailParams) {
  const [release, setRelease] = useState<Release | null>(null);
  const [tickets, setTickets] = useState<ReleaseTicket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<ReleaseTicket[]>([]);
  const [ticketSearchQuery, setTicketSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTickets, setShowTickets] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [isTicketDetailModalOpen, setIsTicketDetailModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isDeploymentModalOpen, setIsDeploymentModalOpen] = useState(false);
  const [deploymentFormData, setDeploymentFormData] = useState<DeploymentCreateData>({
    environment: 'dev',
    status: 'success',
    commit_hash: '',
    notes: '',
  });
  const [isDeploying, setIsDeploying] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    version: '',
    description: '',
    release_notes: '',
    release_date: '',
    git_merge_mr: '',
    git_tag: '',
    git_branch: '',
  });

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditMode && !isDeploymentModalOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, isEditMode, isDeploymentModalOpen, onClose]);

  useEffect(() => {
    if (isOpen && releaseId) {
      loadRelease();
      setActiveTab('overview');
    }
  }, [isOpen, releaseId]);

  const loadRelease = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getRelease(projectId, releaseId);
      setRelease(data);
      setEditFormData({
        name: data.name,
        version: data.version,
        description: data.description || '',
        release_notes: data.release_notes || '',
        release_date: data.release_date ? new Date(data.release_date).toISOString().split('T')[0] : '',
        git_merge_mr: data.git_merge_mr || '',
        git_tag: data.git_tag || '',
        git_branch: data.git_branch || '',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load release');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTickets = async () => {
    setIsLoadingTickets(true);
    try {
      const data = await getReleaseTickets(projectId, releaseId);
      setTickets(data);
      setFilteredTickets(data);
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  useEffect(() => {
    if (ticketSearchQuery.trim()) {
      const query = ticketSearchQuery.toLowerCase();
      const filtered = tickets.filter(
        (ticket) =>
          ticket.key.toLowerCase().includes(query) ||
          ticket.title.toLowerCase().includes(query)
      );
      setFilteredTickets(filtered);
    } else {
      setFilteredTickets(tickets);
    }
  }, [ticketSearchQuery, tickets]);

  const handleViewTickets = () => {
    if (!showTickets) {
      loadTickets();
    } else {
      setTicketSearchQuery('');
    }
    setShowTickets(!showTickets);
  };

  const handleTicketClick = (ticketId: number) => {
    setSelectedTicketId(ticketId);
    setIsTicketDetailModalOpen(true);
  };

  const handleCloseTicketDetail = () => {
    setIsTicketDetailModalOpen(false);
    setSelectedTicketId(null);
  };

  const handleTicketUpdated = () => {
    loadRelease();
    if (showTickets) {
      loadTickets();
    }
    onReleaseUpdated?.();
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!release || isUpdatingStatus) return;

    setIsUpdatingStatus(true);
    setError(null);

    try {
      await updateRelease(projectId, releaseId, { status: newStatus as any });
      await loadRelease();
      onReleaseUpdated?.();
    } catch (err: any) {
      console.error('Failed to update release status:', err);
      setError(err.message || 'Failed to update release status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleEdit = () => {
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    if (release) {
      setEditFormData({
        name: release.name,
        version: release.version,
        description: release.description || '',
        release_notes: release.release_notes || '',
        release_date: release.release_date ? new Date(release.release_date).toISOString().split('T')[0] : '',
        git_merge_mr: release.git_merge_mr || '',
        git_tag: release.git_tag || '',
        git_branch: release.git_branch || '',
      });
    }
    setIsEditMode(false);
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!editFormData.name.trim() || !editFormData.version.trim()) {
      setError('Name and version are required');
      return;
    }

    setIsUpdatingStatus(true);
    setError(null);

    try {
      await updateRelease(projectId, releaseId, {
        name: editFormData.name.trim(),
        version: editFormData.version.trim(),
        description: editFormData.description || undefined,
        release_notes: editFormData.release_notes || undefined,
        release_date: editFormData.release_date || undefined,
        git_merge_mr: editFormData.git_merge_mr || undefined,
        git_tag: editFormData.git_tag || undefined,
        git_branch: editFormData.git_branch || undefined,
      });
      await loadRelease();
      setIsEditMode(false);
      onReleaseUpdated?.();
    } catch (err: any) {
      console.error('Failed to update release:', err);
      setError(err.message || 'Failed to update release');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDelete = async () => {
    if (!release) return;

    const confirmDelete = window.confirm(
      `Are you sure you want to delete release "${release.name} v${release.version}"? This action cannot be undone.`
    );

    if (!confirmDelete) return;

    setIsDeleting(true);
    setError(null);

    try {
      await deleteRelease(projectId, releaseId);
      onReleaseUpdated?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to delete release:', err);
      setError(err.message || 'Failed to delete release');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeploymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDeploying(true);
    setError(null);

    try {
      await createDeployment(projectId, releaseId, deploymentFormData);
      await loadRelease();
      setIsDeploymentModalOpen(false);
      setDeploymentFormData({
        environment: 'dev',
        status: 'success',
        commit_hash: '',
        notes: '',
      });
      onReleaseUpdated?.();
    } catch (err: any) {
      console.error('Failed to create deployment:', err);
      setError(err.message || 'Failed to create deployment');
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    release,
    filteredTickets,
    ticketSearchQuery,
    setTicketSearchQuery,
    isLoading,
    isLoadingTickets,
    isUpdatingStatus,
    isDeleting,
    error,
    showTickets,
    selectedTicketId,
    isTicketDetailModalOpen,
    isEditMode,
    activeTab,
    setActiveTab,
    isDeploymentModalOpen,
    setIsDeploymentModalOpen,
    deploymentFormData,
    setDeploymentFormData,
    isDeploying,
    editFormData,
    setEditFormData,
    handleViewTickets,
    handleTicketClick,
    handleCloseTicketDetail,
    handleTicketUpdated,
    handleStatusChange,
    handleEdit,
    handleCancelEdit,
    handleSaveEdit,
    handleDelete,
    handleDeploymentSubmit,
  };
}
