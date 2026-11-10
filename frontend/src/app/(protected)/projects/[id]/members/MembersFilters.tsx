import React from 'react';
import { Search, Trash2 } from 'lucide-react';
import { tokens } from '../../../../../design-system/tokens';

interface MembersFiltersProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  roleFilter: string;
  setRoleFilter: (value: string) => void;
  selectedCount: number;
  onBulkDelete: () => void;
}

export function MembersFilters({
  searchQuery,
  setSearchQuery,
  roleFilter,
  setRoleFilter,
  selectedCount,
  onBulkDelete,
}: MembersFiltersProps) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: tokens.borderRadius.xl,
      border: `1px solid ${tokens.colors.neutral[200]}`,
      boxShadow: tokens.shadows.sm,
      marginBottom: tokens.spacing[6],
      padding: tokens.spacing[5],
    }}>
      <div style={{
        display: 'flex',
        gap: tokens.spacing[4],
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div style={{
          position: 'relative',
          flex: '1 1 300px',
          maxWidth: '400px',
        }}>
          <div style={{
            position: 'absolute',
            left: tokens.spacing[4],
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Search size={16} color={tokens.colors.neutral[500]} strokeWidth={2} />
          </div>
          <input
            type="text"
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              minHeight: '40px',
              padding: `${tokens.spacing[2]} ${tokens.spacing[4]} ${tokens.spacing[2]} ${tokens.spacing[12]}`,
              fontSize: tokens.typography.sizes.sm,
              fontWeight: tokens.typography.weights.medium,
              border: `2px solid ${tokens.colors.neutral[300]}`,
              borderRadius: tokens.borderRadius.lg,
              background: '#fff',
              color: tokens.colors.neutral[900],
              outline: 'none',
              transition: `all ${tokens.animation.duration.fast}`,
              boxShadow: tokens.shadows.xs,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = tokens.colors.primary[500];
              e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[100]}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = tokens.colors.neutral[300];
              e.currentTarget.style.boxShadow = tokens.shadows.xs;
            }}
          />
        </div>

        {/* Role Filter */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{
            minWidth: '180px',
            minHeight: '40px',
            padding: `${tokens.spacing[2]} ${tokens.spacing[10]} ${tokens.spacing[2]} ${tokens.spacing[4]}`,
            fontSize: tokens.typography.sizes.sm,
            fontWeight: tokens.typography.weights.medium,
            border: `2px solid ${tokens.colors.neutral[300]}`,
            borderRadius: tokens.borderRadius.lg,
            background: '#fff',
            color: tokens.colors.neutral[900],
            outline: 'none',
            cursor: 'pointer',
            transition: `all ${tokens.animation.duration.fast}`,
            boxShadow: tokens.shadows.xs,
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: `right ${tokens.spacing[4]} center`,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = tokens.colors.primary[500];
            e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[100]}`;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = tokens.colors.neutral[300];
            e.currentTarget.style.boxShadow = tokens.shadows.xs;
          }}
        >
          <option value="">All Roles</option>
          <option value="admin">Project Admins</option>
          <option value="member">Members</option>
          <option value="viewer">Viewers</option>
        </select>

        {/* Bulk Actions */}
        {selectedCount > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: tokens.spacing[3],
            marginLeft: 'auto',
            padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
            background: tokens.colors.primary[50],
            borderRadius: tokens.borderRadius.lg,
            border: `1px solid ${tokens.colors.primary[200]}`,
          }}>
            <span style={{
              fontSize: tokens.typography.sizes.sm,
              fontWeight: tokens.typography.weights.semibold,
              color: tokens.colors.primary[700],
            }}>
              {selectedCount} selected
            </span>
            <button
              onClick={onBulkDelete}
              style={{
                padding: `${tokens.spacing[1.5]} ${tokens.spacing[3]}`,
                fontSize: tokens.typography.sizes.sm,
                fontWeight: tokens.typography.weights.semibold,
                color: '#fff',
                background: tokens.colors.error[500],
                border: 'none',
                borderRadius: tokens.borderRadius.md,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: tokens.spacing[1.5],
                transition: `all ${tokens.animation.duration.fast}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = tokens.colors.error[600];
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = tokens.colors.error[500];
              }}
            >
              <Trash2 size={14} />
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
