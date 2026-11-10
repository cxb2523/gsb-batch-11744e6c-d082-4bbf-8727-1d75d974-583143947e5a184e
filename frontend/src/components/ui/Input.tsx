import React from 'react';
import { tokens } from '@/design-system/tokens';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  disabled,
  style,
  className,
  ...props
}) => {
  const [isFocused, setIsFocused] = React.useState(false);

  const inputStyles: React.CSSProperties = {
    background: disabled ? tokens.colors.neutral[100] : tokens.colors.neutral[50],
    border: `1.5px solid ${
      error
        ? tokens.colors.semantic.border.error
        : isFocused
        ? tokens.colors.semantic.border.focus
        : tokens.colors.semantic.border.default
    }`,
    borderRadius: tokens.borderRadius.md,
    padding: `${tokens.spacing[2]} ${tokens.spacing[3]}`,
    fontSize: tokens.typography.sizes.base,
    fontWeight: tokens.typography.weights.regular,
    color: tokens.colors.semantic.text.primary,
    lineHeight: tokens.typography.lineHeights.normal,
    transition: `all ${tokens.animation.duration.fast} ${tokens.animation.easing.easeOut}`,
    outline: 'none',
    width: '100%',
    boxShadow: error
      ? '0px 0px 0px 3px rgba(239, 68, 68, 0.10)'
      : isFocused
      ? '0px 0px 0px 3px rgba(59, 124, 255, 0.10)'
      : 'none',
    cursor: disabled ? 'not-allowed' : 'text',
    paddingLeft: leftIcon ? tokens.spacing[10] : tokens.spacing[3],
    paddingRight: rightIcon ? tokens.spacing[10] : tokens.spacing[3],
  };

  const labelStyles: React.CSSProperties = {
    display: 'block',
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.medium,
    color: error ? tokens.colors.error[600] : tokens.colors.semantic.text.primary,
    marginBottom: tokens.spacing[1.5],
    letterSpacing: '0.01em',
  };

  const helperTextStyles: React.CSSProperties = {
    fontSize: tokens.typography.sizes.xs,
    color: error ? tokens.colors.error[600] : tokens.colors.semantic.text.tertiary,
    marginTop: tokens.spacing[1.5],
  };

  const containerStyles: React.CSSProperties = {
    position: 'relative',
    width: '100%',
  };

  const iconStyles: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    color: tokens.colors.semantic.text.tertiary,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div style={{ ...style }} className={className}>
      {label && <label style={labelStyles}>{label}</label>}
      <div style={containerStyles}>
        {leftIcon && (
          <div style={{ ...iconStyles, left: tokens.spacing[3] }}>{leftIcon}</div>
        )}
        <input
          {...props}
          disabled={disabled}
          style={inputStyles}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
        />
        {rightIcon && (
          <div style={{ ...iconStyles, right: tokens.spacing[3] }}>{rightIcon}</div>
        )}
      </div>
      {(error || helperText) && (
        <div style={helperTextStyles}>{error || helperText}</div>
      )}
    </div>
  );
};
