import React from 'react';
import { UserPlus, AlertCircle, X } from 'lucide-react';
import { tokens } from '../../../../../design-system/tokens';
import { AvailableUser } from '../../../../../lib/api/settings';
import { ButtonCore } from '@/components/ui';
import { getInitials } from './helpers';

interface StagedMember {
  user: AvailableUser;
  role: 'admin' | 'member' | 'viewer';
}

interface InviteMemberModalProps {
  onClose: () => void;
  inviteError: string;
  userSearch: string;
  setUserSearch: (value: string) => void;
  showDropdown: boolean;
  setShowDropdown: (value: boolean) => void;
  loadingUsers: boolean;
  filteredAvailableUsers: AvailableUser[];
  stagedMembers: StagedMember[];
  onStageMember: (user: AvailableUser) => void;
  onUnstageMember: (userId: number) => void;
  onStagedRole: (userId: number, role: 'admin' | 'member' | 'viewer') => void;
  onAddMembers: () => void;
}

export function InviteMemberModal({
  onClose,
  inviteError,
  userSearch,
  setUserSearch,
  showDropdown,
  setShowDropdown,
  loadingUsers,
  filteredAvailableUsers,
  stagedMembers,
  onStageMember,
  onUnstageMember,
  onStagedRole,
  onAddMembers,
}: InviteMemberModalProps) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 999,
          animation: 'fadeIn 0.2s ease-out',
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: '#fff',
          border: `1px solid ${tokens.colors.neutral[200]}`,
          borderRadius: tokens.borderRadius.xl,
          padding: tokens.spacing[6],
          width: '480px',
          maxWidth: '90vw',
          zIndex: 1000,
          boxShadow: tokens.shadows.xl,
          animation: 'slideUp 0.3s ease-out',
        }}
      >
        <h2 style={{
          margin: `0 0 ${tokens.spacing[2]} 0`,
          fontSize: tokens.typography.sizes['2xl'],
          fontWeight: tokens.typography.weights.bold,
          color: tokens.colors.neutral[900],
        }}>
          Invite Team Member
        </h2>
        <p style={{
          margin: `0 0 ${tokens.spacing[6]} 0`,
          fontSize: tokens.typography.sizes.sm,
          color: tokens.colors.neutral[600],
        }}>
          Add a new member to your project team
        </p>

        {inviteError && (
          <div style={{
            marginBottom: tokens.spacing[4],
            padding: tokens.spacing[3],
            background: tokens.colors.error[50],
            border: `1px solid ${tokens.colors.error[200]}`,
            borderRadius: tokens.borderRadius.lg,
            fontSize: tokens.typography.sizes.sm,
            color: tokens.colors.error[700],
            display: 'flex',
            alignItems: 'center',
            gap: tokens.spacing[2],
          }}>
            <AlertCircle size={16} />
            {inviteError}
          </div>
        )}

        <div style={{ marginBottom: tokens.spacing[4] }}>
          <label style={{
            display: 'block',
            marginBottom: tokens.spacing[2],
            fontSize: tokens.typography.sizes.sm,
            fontWeight: tokens.typography.weights.semibold,
            color: tokens.colors.neutral[900],
          }}>
            Add Members
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => { setUserSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              placeholder={loadingUsers ? 'Loading users...' : 'Search by name or email...'}
              style={{
                width: '100%',
                padding: tokens.spacing[3],
                border: `2px solid ${tokens.colors.neutral[300]}`,
                background: '#fff',
                color: tokens.colors.neutral[900],
                borderRadius: tokens.borderRadius.lg,
                fontSize: tokens.typography.sizes.sm,
                outline: 'none',
                transition: `all ${tokens.animation.duration.fast}`,
              }}
              onFocusCapture={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.primary[500];
                e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[100]}`;
              }}
              onBlurCapture={(e) => {
                setTimeout(() => {
                  e.currentTarget.style.borderColor = tokens.colors.neutral[300];
                  e.currentTarget.style.boxShadow = 'none';
                }, 200);
              }}
            />
            {showDropdown && !loadingUsers && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                maxHeight: '240px',
                overflowY: 'auto',
                background: '#fff',
                border: `1px solid ${tokens.colors.neutral[200]}`,
                borderRadius: tokens.borderRadius.lg,
                boxShadow: tokens.shadows.lg,
                zIndex: 10,
                marginTop: tokens.spacing[1],
              }}>
                {filteredAvailableUsers.length === 0 ? (
                  <div style={{
                    padding: tokens.spacing[4],
                    textAlign: 'center',
                    fontSize: tokens.typography.sizes.sm,
                    color: tokens.colors.neutral[600],
                  }}>
                    No users available
                  </div>
                ) : (
                  filteredAvailableUsers.map((user) => (
                    <div
                      key={user.email}
                      onClick={() => onStageMember(user)}
                      style={{
                        padding: tokens.spacing[3],
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: tokens.spacing[3],
                        borderBottom: `1px solid ${tokens.colors.neutral[100]}`,
                        transition: `all ${tokens.animation.duration.fast}`,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = tokens.colors.neutral[50];
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: tokens.borderRadius.full,
                        background: `linear-gradient(135deg, ${tokens.colors.primary[400]} 0%, ${tokens.colors.primary[600]} 100%)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: tokens.typography.sizes.xs,
                        fontWeight: tokens.typography.weights.semibold,
                        color: '#fff',
                        flexShrink: 0,
                      }}>
                        {getInitials(user.name)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: tokens.typography.sizes.sm,
                          fontWeight: tokens.typography.weights.semibold,
                          color: tokens.colors.neutral[900],
                        }}>
                          {user.name}
                        </div>
                        <div style={{
                          fontSize: tokens.typography.sizes.xs,
                          color: tokens.colors.neutral[600],
                        }}>
                          {user.email}{user.designation ? ` · ${user.designation}` : ''}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {stagedMembers.length > 0 && (
            <div style={{ marginTop: tokens.spacing[3], display: 'flex', flexDirection: 'column', gap: tokens.spacing[2] }}>
              {stagedMembers.map(({ user, role }) => (
                <div key={user.user_id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: tokens.spacing[3],
                  padding: tokens.spacing[2],
                  border: `1px solid ${tokens.colors.neutral[200]}`,
                  borderRadius: tokens.borderRadius.lg,
                }}>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: tokens.borderRadius.full,
                    background: `linear-gradient(135deg, ${tokens.colors.primary[400]} 0%, ${tokens.colors.primary[600]} 100%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: tokens.typography.sizes.xs,
                    fontWeight: tokens.typography.weights.semibold,
                    color: '#fff',
                    flexShrink: 0,
                  }}>
                    {getInitials(user.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: tokens.typography.sizes.sm, fontWeight: tokens.typography.weights.semibold, color: tokens.colors.neutral[900], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
                    <div style={{ fontSize: tokens.typography.sizes.xs, color: tokens.colors.neutral[600], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
                  </div>
                  <select
                    value={role}
                    onChange={(e) => onStagedRole(user.user_id, e.target.value as 'admin' | 'member' | 'viewer')}
                    aria-label={`Role for ${user.name}`}
                    style={{
                      padding: `${tokens.spacing[1]} ${tokens.spacing[2]}`,
                      border: `1px solid ${tokens.colors.neutral[300]}`,
                      borderRadius: tokens.borderRadius.md,
                      fontSize: tokens.typography.sizes.sm,
                      color: tokens.colors.neutral[900],
                      background: '#fff',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="member">Member</option>
                    <option value="admin">Project admin</option>
                  </select>
                  <button
                    onClick={() => onUnstageMember(user.user_id)}
                    aria-label={`Remove ${user.name}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: tokens.spacing[1], display: 'flex', flexShrink: 0 }}
                  >
                    <X size={16} color={tokens.colors.neutral[600]} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{
          display: 'flex',
          gap: tokens.spacing[3],
          justifyContent: 'flex-end',
        }}>
          <ButtonCore variant="secondary" onClick={onClose}>
            Cancel
          </ButtonCore>
          <ButtonCore
            variant="primary"
            onClick={onAddMembers}
            disabled={stagedMembers.length === 0}
            leftIcon={<UserPlus size={16} />}
          >
            {stagedMembers.length > 1 ? `Add ${stagedMembers.length} members` : 'Add member'}
          </ButtonCore>
        </div>
      </div>
    </>
  );
}
