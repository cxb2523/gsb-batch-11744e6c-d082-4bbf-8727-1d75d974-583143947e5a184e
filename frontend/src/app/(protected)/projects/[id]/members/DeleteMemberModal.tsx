import React from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';
import { tokens } from '../../../../../design-system/tokens';
import { Member } from './types';

interface DeleteMemberModalProps {
  member: Member;
  onCancel: () => void;
  onConfirm: (member: Member) => void;
}

export function DeleteMemberModal({ member, onCancel, onConfirm }: DeleteMemberModalProps) {
  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 999,
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
          width: '440px',
          maxWidth: '90vw',
          zIndex: 1000,
          boxShadow: tokens.shadows.xl,
        }}
      >
        <div style={{
          width: '48px',
          height: '48px',
          margin: '0 auto',
          marginBottom: tokens.spacing[4],
          background: tokens.colors.error[50],
          borderRadius: tokens.borderRadius.full,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <AlertCircle size={24} color={tokens.colors.error[600]} />
        </div>
        <h2 style={{
          margin: `0 0 ${tokens.spacing[2]} 0`,
          fontSize: tokens.typography.sizes.xl,
          fontWeight: tokens.typography.weights.bold,
          color: tokens.colors.neutral[900],
          textAlign: 'center',
        }}>
          Remove Team Member
        </h2>
        <p style={{
          margin: `0 0 ${tokens.spacing[6]} 0`,
          fontSize: tokens.typography.sizes.sm,
          color: tokens.colors.neutral[600],
          textAlign: 'center',
          lineHeight: 1.6,
        }}>
          Are you sure you want to remove <strong>{member.name}</strong> from the project? This action cannot be undone.
        </p>
        <div style={{
          display: 'flex',
          gap: tokens.spacing[3],
          justifyContent: 'center',
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
              border: `2px solid ${tokens.colors.neutral[300]}`,
              borderRadius: tokens.borderRadius.lg,
              background: '#fff',
              fontSize: tokens.typography.sizes.sm,
              fontWeight: tokens.typography.weights.semibold,
              color: tokens.colors.neutral[700],
              cursor: 'pointer',
              transition: `all ${tokens.animation.duration.fast}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = tokens.colors.neutral[50];
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#fff';
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(member)}
            style={{
              padding: `${tokens.spacing[2]} ${tokens.spacing[5]}`,
              border: 'none',
              borderRadius: tokens.borderRadius.lg,
              background: tokens.colors.error[500],
              fontSize: tokens.typography.sizes.sm,
              fontWeight: tokens.typography.weights.semibold,
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: tokens.spacing[2],
              transition: `all ${tokens.animation.duration.fast}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = tokens.colors.error[600];
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = tokens.colors.error[500];
            }}
          >
            <Trash2 size={16} />
            Remove Member
          </button>
        </div>
      </div>
    </>
  );
}
