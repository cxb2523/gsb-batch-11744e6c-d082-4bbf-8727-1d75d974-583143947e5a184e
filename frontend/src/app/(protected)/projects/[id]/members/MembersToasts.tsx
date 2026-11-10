import React from 'react';
import { Check, X, AlertCircle } from 'lucide-react';
import { tokens } from '../../../../../design-system/tokens';
import { Toast } from './types';

interface MembersToastsProps {
  toasts: Toast[];
}

export function MembersToasts({ toasts }: MembersToastsProps) {
  return (
    <div style={{
      position: 'fixed',
      bottom: tokens.spacing[6],
      right: tokens.spacing[6],
      display: 'flex',
      flexDirection: 'column',
      gap: tokens.spacing[3],
      zIndex: 1100,
    }}>
      {toasts.map(toast => {
        const config = {
          success: { icon: Check, color: tokens.colors.success[600], bg: tokens.colors.success[50], border: tokens.colors.success[200] },
          error: { icon: X, color: tokens.colors.error[600], bg: tokens.colors.error[50], border: tokens.colors.error[200] },
          info: { icon: AlertCircle, color: tokens.colors.primary[600], bg: tokens.colors.primary[50], border: tokens.colors.primary[200] },
        }[toast.type];

        const ToastIcon = config.icon;

        return (
          <div
            key={toast.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: tokens.spacing[3],
              padding: tokens.spacing[4],
              background: '#fff',
              border: `1px solid ${config.border}`,
              borderLeft: `4px solid ${config.color}`,
              borderRadius: tokens.borderRadius.lg,
              boxShadow: tokens.shadows.lg,
              minWidth: '320px',
              maxWidth: '480px',
              animation: 'slideInRight 0.3s ease-out',
            }}
          >
            <div style={{
              flexShrink: 0,
              width: '32px',
              height: '32px',
              borderRadius: tokens.borderRadius.full,
              background: config.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <ToastIcon size={18} color={config.color} strokeWidth={2.5} />
            </div>
            <span style={{
              flex: 1,
              fontSize: tokens.typography.sizes.sm,
              fontWeight: tokens.typography.weights.medium,
              color: tokens.colors.neutral[900],
            }}>
              {toast.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}
