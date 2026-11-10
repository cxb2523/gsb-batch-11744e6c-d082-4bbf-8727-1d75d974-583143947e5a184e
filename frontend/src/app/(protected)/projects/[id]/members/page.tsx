'use client';

import React from 'react';
import { tokens } from '../../../../../design-system/tokens';
import { useMembers } from './useMembers';
import { MembersHeader } from './MembersHeader';
import { MembersFilters } from './MembersFilters';
import { MembersTable } from './MembersTable';
import { InviteMemberModal } from './InviteMemberModal';
import { DeleteMemberModal } from './DeleteMemberModal';
import { MembersToasts } from './MembersToasts';

export default function TeamMembersPage() {
  const {
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
  } = useMembers();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: tokens.colors.neutral[50],
        padding: tokens.spacing[8],
      }}>
        {/* Loading Skeleton */}
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{ marginBottom: tokens.spacing[8] }}>
            <div style={{
              height: '40px',
              width: '200px',
              background: tokens.colors.neutral[200],
              borderRadius: tokens.borderRadius.md,
              marginBottom: tokens.spacing[2],
            }} />
            <div style={{
              height: '20px',
              width: '300px',
              background: tokens.colors.neutral[200],
              borderRadius: tokens.borderRadius.md,
            }} />
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: tokens.spacing[4],
            marginBottom: tokens.spacing[8],
          }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{
                height: '120px',
                background: '#fff',
                borderRadius: tokens.borderRadius.xl,
                border: `1px solid ${tokens.colors.neutral[200]}`,
              }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: tokens.colors.neutral[50],
      padding: tokens.spacing[8],
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <MembersHeader
          stats={stats}
          isProjectAdmin={isProjectAdmin}
          onExport={handleExport}
          onInvite={handleOpenInviteModal}
        />

        <MembersFilters
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}
          selectedCount={selectedCount}
          onBulkDelete={handleBulkDelete}
        />

        <MembersTable
          members={members}
          paginatedMembers={paginatedMembers}
          filteredAndSortedMembers={filteredAndSortedMembers}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
          onSelectAll={handleSelectAll}
          onSelectMember={handleSelectMember}
          isProjectAdmin={isProjectAdmin}
          onRoleChange={handleRoleChange}
          onDeleteMember={setMemberToDelete}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
        />
      </div>

      {showInviteModal && (
        <InviteMemberModal
          onClose={closeInviteModal}
          inviteError={inviteError}
          userSearch={userSearch}
          setUserSearch={setUserSearch}
          showDropdown={showDropdown}
          setShowDropdown={setShowDropdown}
          loadingUsers={loadingUsers}
          filteredAvailableUsers={filteredAvailableUsers}
          stagedMembers={stagedMembers}
          onStageMember={stageMember}
          onUnstageMember={unstageMember}
          onStagedRole={setStagedRole}
          onAddMembers={handleAddMembers}
        />
      )}

      {memberToDelete && (
        <DeleteMemberModal
          member={memberToDelete}
          onCancel={() => setMemberToDelete(null)}
          onConfirm={handleRemoveMember}
        />
      )}

      <MembersToasts toasts={toasts} />

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translate(-50%, -48%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
