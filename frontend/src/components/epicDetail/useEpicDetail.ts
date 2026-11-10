import { useState, useEffect } from 'react';
import { epicsApi, EpicWithStats } from '@/lib/api/epics';
import { ticketsAPI } from '@/lib/api/tickets';
import { membersAPI, ProjectMember } from '@/lib/api/settings';
import { Ticket, getStatusVisual } from './constants';

interface UseEpicDetailParams {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  epicId: number;
  onEpicUpdated?: () => void;
}

export function useEpicDetail({ isOpen, onClose, projectId, epicId, onEpicUpdated }: UseEpicDetailParams) {
  const [epic, setEpic] = useState<EpicWithStats | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const [ticketSearchQuery, setTicketSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddTicketsModalOpen, setIsAddTicketsModalOpen] = useState(false);
  const [showTickets, setShowTickets] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [isTicketDetailModalOpen, setIsTicketDetailModalOpen] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isUpdatingOwner, setIsUpdatingOwner] = useState(false);

  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && epicId) {
      loadEpic();
    }
  }, [isOpen, epicId]);

  // Fetch members when modal opens
  useEffect(() => {
    if (isOpen && projectId) {
      const fetchData = async () => {
        try {
          const fetchedMembers = await membersAPI.getMembers(projectId);
          setMembers(fetchedMembers);
        } catch (err) {
          console.error('Failed to fetch data:', err);
        }
      };

      fetchData();
    }
  }, [isOpen, projectId]);

  const loadEpic = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await epicsApi.getEpic(projectId, epicId);
      setEpic(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load epic');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTickets = async () => {
    setIsLoadingTickets(true);
    try {
      // include_subtasks so this list matches epic.total_tickets, which the backend
      // computes over every non-archived ticket in the epic, subtasks included.
      // Without this the header count (e.g. 5) outran the rows shown (4).
      const epicTickets = await ticketsAPI.getTickets(projectId, {
        include_subtasks: true,
        epic_id: epicId,
      });
      setTickets(epicTickets);
      setFilteredTickets(epicTickets);
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  useEffect(() => {
    // Filter tickets based on search query
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
      setTicketSearchQuery(''); // Clear search when hiding
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
    loadEpic(); // Reload epic stats
    if (showTickets) {
      loadTickets(); // Reload tickets list
    }
    onEpicUpdated?.();
  };

  const handleOwnerChange = async (newOwnerId: string) => {
    if (!epic || isUpdatingOwner) return;

    setIsUpdatingOwner(true);
    setError(null);

    try {
      const updatedEpic = await epicsApi.updateEpic(projectId, epicId, {
        assignee_id: newOwnerId ? Number(newOwnerId) : undefined,
      });

      // Update local state with the new epic data
      setEpic(updatedEpic as EpicWithStats);

      if (onEpicUpdated) {
        onEpicUpdated();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update epic owner');
    } finally {
      setIsUpdatingOwner(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!epic || isUpdatingStatus) return;

    // Check if trying to mark as completed when not all tickets are completed
    if (newStatus === 'completed' && epic.completed_tickets < epic.total_tickets) {
      setError(
        `Cannot mark epic as completed. ${epic.total_tickets - epic.completed_tickets} ticket${
          epic.total_tickets - epic.completed_tickets !== 1 ? 's are' : ' is'
        } still not completed.`
      );
      return;
    }

    setIsUpdatingStatus(true);
    setError(null);

    try {
      await epicsApi.updateEpic(projectId, epicId, { status: newStatus });
      await loadEpic(); // Reload epic to get updated data
      onEpicUpdated?.();
    } catch (err: any) {
      console.error('Failed to update epic status:', err);
      setError(err.message || 'Failed to update epic status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleAddTickets = () => {
    setIsAddTicketsModalOpen(true);
  };

  const handleRemoveTicketFromEpic = async (ticketId: number) => {
    if (!confirm('Are you sure you want to remove this ticket from the epic?')) {
      return;
    }

    try {
      // Update the ticket to remove epic association
      await ticketsAPI.updateTicket(projectId, ticketId, {
        epic_id: null, // Set epic_id to null to remove from epic
      });

      // Remove ticket from local state immediately for better UX
      setTickets(prev => prev.filter(t => t.id !== ticketId));
      setFilteredTickets(prev => prev.filter(t => t.id !== ticketId));

      // Reload epic to get updated stats
      await loadEpic();

      // Notify parent if needed
      onEpicUpdated?.();
    } catch (err) {
      console.error('Failed to remove ticket from epic:', err);
      alert('Failed to remove ticket from epic. Please try again.');
    }
  };

  const handleTicketsAdded = () => {
    loadEpic(); // Reload epic to get updated stats
    if (showTickets) {
      loadTickets(); // Reload tickets list if it's showing
    }
    onEpicUpdated?.();
  };

  const statusVisual = epic ? getStatusVisual(epic.status) : null;
  const progressColor = epic && epic.progress_percentage === 100 ? '#00875A' : '#0052CC';

  return {
    epic,
    tickets,
    filteredTickets,
    ticketSearchQuery,
    setTicketSearchQuery,
    isLoading,
    isLoadingTickets,
    isUpdatingStatus,
    error,
    isAddTicketsModalOpen,
    setIsAddTicketsModalOpen,
    showTickets,
    selectedTicketId,
    isTicketDetailModalOpen,
    members,
    isUpdatingOwner,
    statusVisual,
    progressColor,
    handleViewTickets,
    handleTicketClick,
    handleCloseTicketDetail,
    handleTicketUpdated,
    handleOwnerChange,
    handleStatusChange,
    handleAddTickets,
    handleRemoveTicketFromEpic,
    handleTicketsAdded,
  };
}
