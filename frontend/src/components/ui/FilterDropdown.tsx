'use client';

import React, { ReactNode } from 'react';
import { tokens } from '@/design-system/tokens';

interface FilterDropdownProps {
  value: string | number;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string | number }>;
  placeholder?: string;
  icon?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  fullWidth?: boolean;
}

/**
 * Standardized Filter Dropdown Component
 *
 * Features:
 * - Professional modern appearance with clean design
 * - Proper icon alignment (no overlapping)
 * - Consistent spacing and padding
 * - Smooth focus states with ring/glow effect
 * - Custom dropdown arrow styling
 * - Minimum 40px height for touch targets
 * - Adequate padding for text readability
 * - Fully accessible with proper ARIA attributes
 * - Responsive design
 */
export const FilterDropdown: React.FC<FilterDropdownProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  icon,
  className = '',
  style = {},
  fullWidth = false,
}) => {
  const [isFocused, setIsFocused] = React.useState(false);

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-block',
    width: fullWidth ? '100%' : 'auto',
    ...style,
  };

  const selectStyle: React.CSSProperties = {
    // Minimum height for touch targets
    minHeight: '40px',
    height: '40px',

    // Proper padding - left accounts for icon, right for arrow
    paddingLeft: icon ? tokens.spacing[10] : tokens.spacing[3],
    paddingRight: tokens.spacing[10],
    paddingTop: tokens.spacing[2],
    paddingBottom: tokens.spacing[2],

    // Typography
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.medium,
    fontFamily: tokens.fontFamily.sans,
    color: tokens.colors.neutral[900],

    // Borders and background
    border: `1.5px solid ${isFocused ? tokens.colors.primary[500] : tokens.colors.neutral[300]}`,
    borderRadius: tokens.borderRadius.lg,
    background: '#fff',

    // Remove default appearance
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',

    // Custom dropdown arrow
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `right ${tokens.spacing[3]} center`,

    // Interaction
    cursor: 'pointer',
    outline: 'none',
    width: '100%',

    // Smooth transitions
    transition: `all ${tokens.animation.duration.fast} ${tokens.animation.easing.easeOut}`,

    // Shadow
    boxShadow: isFocused
      ? `0 0 0 3px ${tokens.colors.primary[100]}`
      : tokens.shadows.xs,
  };

  const iconStyle: React.CSSProperties = {
    position: 'absolute',
    left: tokens.spacing[3],
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colors.neutral[500],
    zIndex: 1,
  };

  return (
    <div className={className} style={containerStyle}>
      {icon && <div style={iconStyle}>{icon}</div>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={selectStyle}
        aria-label={placeholder}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default FilterDropdown;
