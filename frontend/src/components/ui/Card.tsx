import React from 'react';
import { tokens } from '@/design-system/tokens';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'glass';
  interactive?: boolean;
  padding?: 'none' | 'small' | 'medium' | 'large';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  interactive = false,
  padding = 'medium',
  style,
  ...props
}) => {
  const [isHovered, setIsHovered] = React.useState(false);

  const paddingStyles = {
    none: '0px',
    small: tokens.spacing[4],
    medium: tokens.spacing[6],
    large: tokens.spacing[8],
  };

  const variantStyles = {
    default: {
      background: tokens.colors.semantic.background.default,
      border: `1px solid ${tokens.colors.semantic.border.default}`,
      borderRadius: tokens.borderRadius.lg,
      boxShadow: tokens.shadows.card,
    },
    elevated: {
      background: tokens.colors.semantic.background.default,
      border: 'none',
      borderRadius: tokens.borderRadius.xl,
      boxShadow: tokens.shadows.md,
    },
    glass: {
      background: tokens.gradients.glass,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.6)',
      borderRadius: tokens.borderRadius.xl,
      boxShadow: tokens.shadows.glass,
    },
  };

  const baseStyles: React.CSSProperties = {
    padding: paddingStyles[padding],
    transition: `all ${tokens.animation.duration.normal} ${tokens.animation.easing.easeOut}`,
    ...variantStyles[variant],
  };

  const interactiveStyles: React.CSSProperties = interactive
    ? {
        cursor: 'pointer',
        ...(isHovered && {
          boxShadow: tokens.shadows.lg,
          transform: 'translateY(-2px)',
          borderColor: variant === 'default' ? tokens.colors.semantic.border.hover : undefined,
        }),
      }
    : {};

  return (
    <div
      {...props}
      style={{ ...baseStyles, ...interactiveStyles, ...style }}
      onMouseEnter={() => interactive && setIsHovered(true)}
      onMouseLeave={() => interactive && setIsHovered(false)}
    >
      {children}
    </div>
  );
};
