import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../../../hooks/useAuth';
import { membersAPI, AvailableUser } from '../../../../../lib/api/settings';
import { Member, SortField, SortDirection, Toast } from './types';
import { getInitials } from './helpers';

export function useMembers() {
  const params = useParams();
  const projectId = parseInt(params.id as string);
  const { user, isAdmin } = useAuth();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [stagedMembers, setStagedMembers] = useState<{ user: AvailableUser; role: 'admin' | 'member' | 'viewer' }[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchMembers();
  }, [projectId]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const fetchedMembers = await membersAPI.getMembers(projectId);

      const membersWithStats = fetchedMembers.map(member => ({
        ...member,
        assignedIssues: member.assigned_issues ?? 0,
        lastActive: member.last_active ?? member.joined_at,
        initials: member.initials ?? getInitials(member.name),
        selected: false,
      }));

      setMembers(membersWithStats);
    } catch (error) {
      console.error('Failed to fetch members:', error);
      showToast('error', 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const fetchAvailableUsers = async () => {
    try {
      setLoadingUsers(true);
      // Excludes global admins (they already have access) and existing members.
      const users = await membersAPI.getAssignableUsers(projectId);
      setAvailableUsers(users);
    } catch (error) {
      console.error('Failed to fetch available users:', error);
      showToast('error', 'Failed to load available users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleOpenInviteModal = () => {
    setShowInviteModal(true);
    setStagedMembers([]);
    setUserSearch('');
    setInviteError('');
    fetchAvailableUsers();
  };

  const closeInviteModal = () => {
    setShowInviteModal(false);
    setStagedMembers([]);
    setUserSearch('');
    setInviteError('');
  };

  // Close the invite modal on Escape, like the rest of the app's modals.
  useEffect(() => {
    if (!showInviteModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeInviteModal();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showInviteModal]);

  const stagedIds = new Set(stagedMembers.map(s => s.user.user_id));
  const filteredAvailableUsers = availableUsers.filter(u =>
    !stagedIds.has(u.user_id) &&
    (u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const stageMember = (user: AvailableUser) => {
    setStagedMembers(prev => [...prev, { user, role: 'member' }]);
    setUserSearch('');
    setShowDropdown(false);
  };

  const unstageMember = (userId: number) => {
    setStagedMembers(prev => prev.filter(s => s.user.user_id !== userId));
  };

  const setStagedRole = (userId: number, role: 'admin' | 'member' | 'viewer') => {
    setStagedMembers(prev => prev.map(s => s.user.user_id === userId ? { ...s, role } : s));
  };

  const handleAddMembers = async () => {
    if (stagedMembers.length === 0) {
      setInviteError('Please select at least one member');
      return;
    }

    try {
      setInviteError('');
      await membersAPI.addMembersBulk(
        projectId,
        stagedMembers.map(s => ({ user_id: s.user.user_id, role: s.role })),
      );

      const count = stagedMembers.length;
      await fetchMembers();
      setShowInviteModal(false);
      setStagedMembers([]);
      setUserSearch('');
      showToast('success', `${count} member${count === 1 ? '' : 's'} added to the project`);
    } catch (error) {
      console.error('Failed to add members:', error);
      setInviteError('Failed to add members. Please try again.');
    }
  };

  const handleRemoveMember = async (member: Member) => {
    try {
      if (member.user_id === 0) {
        await membersAPI.removePendingMember(projectId, member.email);
      } else {
        await membersAPI.removeMember(projectId, member.user_id);
      }
      await fetchMembers();
      setMemberToDelete(null);
      showToast('success', `${member.name} has been removed from the project`);
    } catch (error) {
      console.error('Failed to remove member:', error);
      showToast('error', 'Failed to remove member. Please try again.');
    }
  };

  const handleRoleChange = async (userId: number, newRole: 'admin' | 'member' | 'viewer') => {
    try {
      await membersAPI.updateMember(projectId, userId, { role: newRole });
      await fetchMembers();
      showToast('success', 'Member role updated successfully');
    } catch (error) {
      console.error('Failed to update member role:', error);
      showToast('error', 'Failed to update member role');
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSelectAll = (checked: boolean) => {
    // Global admins can't be removed, so never select them for bulk actions.
    setMembers(prev => prev.map(m => ({ ...m, selected: checked && !m.is_global_admin })));
  };

  const handleSelectMember = (userId: number, checked: boolean) => {
    setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, selected: checked } : m));
  };

  const handleBulkDelete = async () => {
    const selectedMembers = members.filter(m => m.selected);
    if (selectedMembers.length === 0) return;

    if (!confirm(`Are you sure you want to remove ${selectedMembers.length} member(s)?`)) return;

    try {
      await Promise.all(selectedMembers.map(m =>
        m.user_id === 0
          ? membersAPI.removePendingMember(projectId, m.email)
          : membersAPI.removeMember(projectId, m.user_id)
      ));
      await fetchMembers();
      showToast('success', `${selectedMembers.length} member(s) removed successfully`);
    } catch (error) {
      showToast('error', 'Failed to remove members');
    }
  };

  const handleExport = () => {
    const csv = [
      ['Name', 'Email', 'Role', 'Assigned Issues', 'Last Active'].join(','),
      ...filteredAndSortedMembers.map(m => [
        m.name,
        m.email,
        m.role,
        m.assignedIssues,
        m.lastActive ? new Date(m.lastActive).toLocaleDateString() : 'N/A'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team-members-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showToast('success', 'Member list exported successfully');
  };

  const stats = {
    totalMembers: members.length,
    // Project admins are explicit project_members with the admin role — not the
    // global admins who are listed on every project via implicit access.
    projectAdmins: members.filter(m => m.role === 'admin' && !m.is_global_admin).length,
    activeMembers: members.filter(m => m.active !== false).length,
    avgIssues: members.length > 0 ? Math.round(members.reduce((sum, m) => sum + m.assignedIssues, 0) / members.length) : 0,
  };

  const filteredMembers = members.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = !roleFilter || member.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Sort by the role label the user actually sees (Global Admin, Member,
  // Project Admin, Viewer) rather than the raw role value — otherwise global
  // and project admins (both role='admin') interleave and the order doesn't
  // match the displayed labels.
  const getRoleLabel = (member: Member): string => {
    if (member.is_global_admin) return 'Global Admin';
    switch (member.role) {
      case 'admin': return 'Project Admin';
      case 'member': return 'Member';
      case 'viewer': return 'Viewer';
      default: return member.role;
    }
  };

  const filteredAndSortedMembers = [...filteredMembers].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'role':
        comparison = getRoleLabel(a).localeCompare(getRoleLabel(b));
        break;
      case 'assignedIssues':
        comparison = a.assignedIssues - b.assignedIssues;
        break;
      case 'lastActive':
        comparison = new Date(a.lastActive || 0).getTime() - new Date(b.lastActive || 0).getTime();
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const paginatedMembers = filteredAndSortedMembers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredAndSortedMembers.length / itemsPerPage);
  const selectedCount = members.filter(m => m.selected).length;

  // Project admins (project_members.role=admin) and global admins can manage members.
  // Regular members can view the list but not invite, remove, or change roles.
  const isProjectAdmin = isAdmin || (!loading && members.some(m => m.user_id === user?.id && m.role === 'admin'));

  return {
    members,
    loading,
    searchQuery,
    setSearchQuery,
    roleFilter,
    setRoleFilter,
    showInviteModal,
    stagedMembers,
    userSearch,
    setUserSearch,
    showDropdown,
    setShowDropdown,
    inviteError,
    loadingUsers,
    sortField,
    sortDirection,
    currentPage,
    setCurrentPage,
    toasts,
    memberToDelete,
    setMemberToDelete,
    itemsPerPage,
    isProjectAdmin,
    stats,
    filteredAvailableUsers,
    filteredAndSortedMembers,
    paginatedMembers,
    totalPages,
    selectedCount,
    handleOpenInviteModal,
    closeInviteModal,
    stageMember,
    unstageMember,
    setStagedRole,
    handleAddMembers,
    handleRemoveMember,
    handleRoleChange,
    handleSort,
    handleSelectAll,
    handleSelectMember,
    handleBulkDelete,
    handleExport,
  };
}
