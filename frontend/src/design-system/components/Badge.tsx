import React from 'react';
import { tokens } from '../tokens';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error';
  style?: React.CSSProperties;
}

const variantStyles = {
  default: {
    background: tokens.gradients.accentGlow,
    color: tokens.colors.semantic.background.default
  },
  primary: {
    background: tokens.gradients.accentGlow,
    color: tokens.colors.semantic.background.default
  },
  success: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    color: tokens.colors.success[600]
  },
  warning: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    color: tokens.colors.warning[600]
  },
  error: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    color: tokens.colors.error[600]
  }
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  style
}) => {
  const variantStyle = variantStyles[variant];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingInline: tokens.spacing[2],
        paddingBlock: 3,
        borderRadius: tokens.borderRadius.sm,
        fontSize: tokens.typography.styles.caption.fontSize,
        fontWeight: tokens.typography.weights.semibold,
        lineHeight: tokens.typography.styles.caption.lineHeight,
        ...variantStyle,
        ...style
      }}
    >
      {children}
    </span>
  );
};
