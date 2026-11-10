import React from 'react';
import { Users, Crown, ChevronUp, ChevronDown, ChevronsUpDown, Trash2 } from 'lucide-react';
import { tokens } from '../../../../../design-system/tokens';
import { Member, SortField, SortDirection } from './types';
import { getRoleBadgeConfig, formatLastActive } from './helpers';

interface MembersTableProps {
  members: Member[];
  paginatedMembers: Member[];
  filteredAndSortedMembers: Member[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  onSelectAll: (checked: boolean) => void;
  onSelectMember: (userId: number, checked: boolean) => void;
  isProjectAdmin: boolean;
  onRoleChange: (userId: number, role: 'admin' | 'member' | 'viewer') => void;
  onDeleteMember: (member: Member) => void;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  itemsPerPage: number;
}

const sortableHeaderStyle: React.CSSProperties = {
  padding: tokens.spacing[4],
  textAlign: 'left',
  fontSize: tokens.typography.sizes.sm,
  fontWeight: tokens.typography.weights.semibold,
  color: tokens.colors.neutral[700],
  cursor: 'pointer',
  userSelect: 'none',
};

export function MembersTable({
  members,
  paginatedMembers,
  filteredAndSortedMembers,
  sortField,
  sortDirection,
  onSort,
  onSelectAll,
  onSelectMember,
  isProjectAdmin,
  onRoleChange,
  onDeleteMember,
  currentPage,
  setCurrentPage,
  totalPages,
  itemsPerPage,
}: MembersTableProps) {
  const sortIcon = (field: SortField) =>
    sortField === field ? (
      sortDirection === 'asc'
        ? <ChevronUp size={16} color={tokens.colors.primary[600]} />
        : <ChevronDown size={16} color={tokens.colors.primary[600]} />
    ) : <ChevronsUpDown size={16} color={tokens.colors.neutral[400]} />;

  return (
    <div style={{
      background: '#fff',
      borderRadius: tokens.borderRadius.xl,
      border: `1px solid ${tokens.colors.neutral[200]}`,
      boxShadow: tokens.shadows.sm,
      overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          minWidth: '860px',
        }}>
          {/* Fixed column widths so headers/cells never shift when sorting. */}
          <colgroup>
            <col style={{ width: '48px' }} />
            <col style={{ width: 'auto' }} />
            <col style={{ width: '200px' }} />
            <col style={{ width: '170px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '100px' }} />
          </colgroup>
          <thead>
            <tr style={{
              background: tokens.colors.neutral[50],
              borderBottom: `2px solid ${tokens.colors.neutral[200]}`,
            }}>
              <th style={{
                padding: tokens.spacing[4],
                textAlign: 'left',
                width: '40px',
              }}>
                <input
                  type="checkbox"
                  checked={members.some(m => !m.is_global_admin) && members.every(m => m.is_global_admin || m.selected)}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                  }}
                />
              </th>
              <th onClick={() => onSort('name')} style={sortableHeaderStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[2] }}>
                  <span>Member</span>
                  {sortIcon('name')}
                </div>
              </th>
              <th onClick={() => onSort('role')} style={sortableHeaderStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[2] }}>
                  <span>Role</span>
                  {sortIcon('role')}
                </div>
              </th>
              <th onClick={() => onSort('assignedIssues')} style={sortableHeaderStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[2] }}>
                  <span>Assigned Issues</span>
                  {sortIcon('assignedIssues')}
                </div>
              </th>
              <th onClick={() => onSort('lastActive')} style={sortableHeaderStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[2] }}>
                  <span>Last Active</span>
                  {sortIcon('lastActive')}
                </div>
              </th>
              <th style={{
                padding: tokens.spacing[4],
                textAlign: 'left',
                fontSize: tokens.typography.sizes.sm,
                fontWeight: tokens.typography.weights.semibold,
                color: tokens.colors.neutral[700],
                width: '100px',
              }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedMembers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{
                  padding: tokens.spacing[16],
                  textAlign: 'center',
                }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: tokens.spacing[4],
                  }}>
                    <div style={{
                      width: '64px',
                      height: '64px',
                      background: tokens.colors.neutral[100],
                      borderRadius: tokens.borderRadius.full,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Users size={32} color={tokens.colors.neutral[400]} />
                    </div>
                    <div>
                      <h3 style={{
                        fontSize: tokens.typography.sizes.lg,
                        fontWeight: tokens.typography.weights.semibold,
                        color: tokens.colors.neutral[900],
                        marginBottom: tokens.spacing[2],
                      }}>
                        No members found
                      </h3>
                      <p style={{
                        fontSize: tokens.typography.sizes.sm,
                        color: tokens.colors.neutral[600],
                        margin: 0,
                      }}>
                        Try adjusting your search or filter criteria
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedMembers.map((member, index) => {
                const roleBadge = member.is_global_admin
                  ? { ...getRoleBadgeConfig('admin'), icon: Crown, label: 'Global Admin', color: tokens.colors.warning[700], bg: tokens.colors.warning[50], border: tokens.colors.warning[200] }
                  : getRoleBadgeConfig(member.role);
                const RoleIcon = roleBadge.icon;

                return (
                  <tr
                    key={member.user_id}
                    style={{
                      borderBottom: index < paginatedMembers.length - 1 ? `1px solid ${tokens.colors.neutral[200]}` : 'none',
                      background: member.selected ? tokens.colors.primary[50] : (index % 2 === 0 ? '#fff' : tokens.colors.neutral[50]),
                      transition: `all ${tokens.animation.duration.fast}`,
                    }}
                    onMouseEnter={(e) => {
                      if (!member.selected) {
                        e.currentTarget.style.background = tokens.colors.neutral[100];
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!member.selected) {
                        e.currentTarget.style.background = index % 2 === 0 ? '#fff' : tokens.colors.neutral[50];
                      }
                    }}
                  >
                    <td style={{ padding: tokens.spacing[4] }}>
                      <input
                        type="checkbox"
                        checked={member.selected || false}
                        disabled={member.is_global_admin}
                        onChange={(e) => onSelectMember(member.user_id, e.target.checked)}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: member.is_global_admin ? 'not-allowed' : 'pointer',
                          opacity: member.is_global_admin ? 0.4 : 1,
                        }}
                      />
                    </td>
                    <td style={{ padding: tokens.spacing[4] }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: tokens.spacing[3],
                      }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: tokens.borderRadius.full,
                          background: `linear-gradient(135deg, ${tokens.colors.primary[400]} 0%, ${tokens.colors.primary[600]} 100%)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: tokens.typography.sizes.sm,
                          fontWeight: tokens.typography.weights.semibold,
                          color: '#fff',
                          flexShrink: 0,
                        }}>
                          {member.initials}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: tokens.typography.sizes.sm,
                            fontWeight: tokens.typography.weights.semibold,
                            color: tokens.colors.neutral[900],
                            marginBottom: '2px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {member.name}
                          </div>
                          <div style={{
                            fontSize: tokens.typography.sizes.xs,
                            color: tokens.colors.neutral[600],
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {member.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: tokens.spacing[4] }}>
                      {isProjectAdmin && member.user_id !== 0 && !member.is_global_admin ? (
                        <select
                          value={member.role}
                          onChange={(e) => onRoleChange(member.user_id, e.target.value as 'admin' | 'member' | 'viewer')}
                          style={{
                            padding: `${tokens.spacing[1.5]} ${tokens.spacing[8]} ${tokens.spacing[1.5]} ${tokens.spacing[3]}`,
                            fontSize: tokens.typography.sizes.xs,
                            fontWeight: tokens.typography.weights.semibold,
                            color: roleBadge.color,
                            background: roleBadge.bg,
                            border: `1px solid ${roleBadge.border}`,
                            borderRadius: tokens.borderRadius.full,
                            cursor: 'pointer',
                            outline: 'none',
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            MozAppearance: 'none',
                            backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 8px center',
                          }}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="member">Member</option>
                          <option value="admin">Project Admin</option>
                        </select>
                      ) : (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: tokens.spacing[1.5],
                          padding: `${tokens.spacing[1.5]} ${tokens.spacing[3]}`,
                          fontSize: tokens.typography.sizes.xs,
                          fontWeight: tokens.typography.weights.semibold,
                          color: roleBadge.color,
                          background: roleBadge.bg,
                          border: `1px solid ${roleBadge.border}`,
                          borderRadius: tokens.borderRadius.full,
                        }}>
                          <RoleIcon size={12} />
                          {roleBadge.label}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: tokens.spacing[4] }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: tokens.spacing[2],
                      }}>
                        <div style={{
                          padding: `${tokens.spacing[1]} ${tokens.spacing[2]}`,
                          background: member.assignedIssues > 0 ? tokens.colors.primary[100] : tokens.colors.neutral[100],
                          borderRadius: tokens.borderRadius.md,
                          fontSize: tokens.typography.sizes.sm,
                          fontWeight: tokens.typography.weights.bold,
                          color: member.assignedIssues > 0 ? tokens.colors.primary[700] : tokens.colors.neutral[600],
                        }}>
                          {member.assignedIssues}
                        </div>
                        <span style={{
                          fontSize: tokens.typography.sizes.sm,
                          color: tokens.colors.neutral[600],
                        }}>
                          {member.assignedIssues === 1 ? 'issue' : 'issues'}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: tokens.spacing[4] }}>
                      <div style={{
                        fontSize: tokens.typography.sizes.sm,
                        color: tokens.colors.neutral[700],
                      }}>
                        {formatLastActive(member.lastActive)}
                      </div>
                    </td>
                    <td style={{ padding: tokens.spacing[4] }}>
                      {isProjectAdmin && !member.is_global_admin && <button
                        onClick={() => onDeleteMember(member)}
                        style={{
                          padding: tokens.spacing[2],
                          background: 'transparent',
                          border: `1px solid ${tokens.colors.neutral[300]}`,
                          borderRadius: tokens.borderRadius.md,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: `all ${tokens.animation.duration.fast}`,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = tokens.colors.error[50];
                          e.currentTarget.style.borderColor = tokens.colors.error[300];
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.borderColor = tokens.colors.neutral[300];
                        }}
                      >
                        <Trash2 size={16} color={tokens.colors.error[600]} />
                      </button>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          padding: tokens.spacing[4],
          borderTop: `1px solid ${tokens.colors.neutral[200]}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{
            fontSize: tokens.typography.sizes.sm,
            color: tokens.colors.neutral[600],
          }}>
            Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredAndSortedMembers.length)} of {filteredAndSortedMembers.length} members
          </div>
          <div style={{
            display: 'flex',
            gap: tokens.spacing[2],
          }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{
                padding: `${tokens.spacing[2]} ${tokens.spacing[3]}`,
                fontSize: tokens.typography.sizes.sm,
                fontWeight: tokens.typography.weights.medium,
                color: currentPage === 1 ? tokens.colors.neutral[400] : tokens.colors.neutral[700],
                background: '#fff',
                border: `1px solid ${tokens.colors.neutral[300]}`,
                borderRadius: tokens.borderRadius.md,
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                style={{
                  padding: `${tokens.spacing[2]} ${tokens.spacing[3]}`,
                  fontSize: tokens.typography.sizes.sm,
                  fontWeight: tokens.typography.weights.medium,
                  color: page === currentPage ? '#fff' : tokens.colors.neutral[700],
                  background: page === currentPage ? tokens.colors.primary[500] : '#fff',
                  border: `1px solid ${page === currentPage ? tokens.colors.primary[500] : tokens.colors.neutral[300]}`,
                  borderRadius: tokens.borderRadius.md,
                  cursor: 'pointer',
                  minWidth: '36px',
                }}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{
                padding: `${tokens.spacing[2]} ${tokens.spacing[3]}`,
                fontSize: tokens.typography.sizes.sm,
                fontWeight: tokens.typography.weights.medium,
                color: currentPage === totalPages ? tokens.colors.neutral[400] : tokens.colors.neutral[700],
                background: '#fff',
                border: `1px solid ${tokens.colors.neutral[300]}`,
                borderRadius: tokens.borderRadius.md,
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
