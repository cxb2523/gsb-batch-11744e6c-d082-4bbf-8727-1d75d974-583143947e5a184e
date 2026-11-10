import React from 'react';
import { tokens } from '@/design-system/tokens';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary';
  size?: 'small' | 'medium';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'medium',
  style,
  ...props
}) => {
  const variantStyles = {
    success: {
      background: tokens.colors.success[50],
      color: tokens.colors.success[700],
    },
    warning: {
      background: tokens.colors.warning[50],
      color: tokens.colors.warning[700],
    },
    error: {
      background: tokens.colors.error[50],
      color: tokens.colors.error[700],
    },
    info: {
      background: tokens.colors.info[50],
      color: tokens.colors.info[700],
    },
    neutral: {
      background: tokens.colors.neutral[100],
      color: tokens.colors.neutral[600],
    },
    primary: {
      background: tokens.colors.primary[50],
      color: tokens.colors.primary[700],
    },
  };

  const sizeStyles = {
    small: {
      fontSize: tokens.typography.sizes.xs,
      padding: `${tokens.spacing[0.5]} ${tokens.spacing[2]}`,
    },
    medium: {
      fontSize: tokens.typography.sizes.xs,
      padding: `${tokens.spacing[1]} ${tokens.spacing[2]}`,
    },
  };

  const baseStyles: React.CSSProperties = {
    display: 'inline-block',
    fontWeight: tokens.typography.weights.semibold,
    borderRadius: tokens.borderRadius.full,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    ...sizeStyles[size],
    ...variantStyles[variant],
  };

  return (
    <span {...props} style={{ ...baseStyles, ...style }}>
      {children}
    </span>
  );
};
