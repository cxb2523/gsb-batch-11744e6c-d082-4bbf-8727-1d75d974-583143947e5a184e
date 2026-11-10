'use client';

import React from 'react';

interface GridLogoProps {
  size?: number;
  variant?: 'full' | 'icon' | 'wordmark';
  theme?: 'light' | 'dark';
  animated?: boolean;
}

export const GridLogo: React.FC<GridLogoProps> = ({
  size = 40,
  variant = 'full',
  theme = 'light',
  animated = false,
}) => {
  const primaryColor = theme === 'dark' ? '#60A5FA' : '#2563EB'; // Blue 500/400
  const accentColor = theme === 'dark' ? '#34D399' : '#10B981'; // Green 400/500
  const textColor = theme === 'dark' ? '#F9FAFB' : '#111827'; // Gray 50/900

  // Icon only
  if (variant === 'icon') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          animation: animated ? 'logoFloat 3s ease-in-out infinite' : 'none',
        }}
      >
        {/* Background rounded square */}
        <rect
          x="8"
          y="8"
          width="84"
          height="84"
          rx="18"
          fill={primaryColor}
          opacity="0.1"
        />

        {/* Grid pattern - representing organized structure */}
        <g opacity="0.8">
          {/* Top row */}
          <rect x="20" y="20" width="16" height="16" rx="3" fill={primaryColor} />
          <rect x="42" y="20" width="16" height="16" rx="3" fill={primaryColor} opacity="0.7" />
          <rect x="64" y="20" width="16" height="16" rx="3" fill={primaryColor} opacity="0.5" />

          {/* Middle row */}
          <rect x="20" y="42" width="16" height="16" rx="3" fill={primaryColor} opacity="0.7" />
          <rect x="42" y="42" width="16" height="16" rx="3" fill={accentColor} />
          <rect x="64" y="42" width="16" height="16" rx="3" fill={primaryColor} opacity="0.5" />

          {/* Bottom row */}
          <rect x="20" y="64" width="16" height="16" rx="3" fill={primaryColor} opacity="0.5" />
          <rect x="42" y="64" width="16" height="16" rx="3" fill={primaryColor} opacity="0.7" />
          <rect x="64" y="64" width="16" height="16" rx="3" fill={primaryColor} />
        </g>

        {/* Connecting lines - representing workflow */}
        <g stroke={accentColor} strokeWidth="2" opacity="0.6">
          <line x1="28" y1="36" x2="28" y2="42" />
          <line x1="50" y1="36" x2="50" y2="42" />
          <line x1="36" y1="50" x2="42" y2="50" />
          <line x1="58" y1="50" x2="64" y2="50" />
          <line x1="50" y1="58" x2="50" y2="64" />
        </g>

        <style>{`
          @keyframes logoFloat {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-4px); }
          }
        `}</style>
      </svg>
    );
  }

  // Wordmark only
  if (variant === 'wordmark') {
    return (
      <svg
        width={size * 2.5}
        height={size}
        viewBox="0 0 250 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <text
          x="0"
          y="70"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontSize="64"
          fontWeight="700"
          fill={textColor}
          letterSpacing="-0.02em"
        >
          Grid
        </text>
        {/* Accent dot */}
        <circle cx="210" cy="60" r="8" fill={accentColor} />
      </svg>
    );
  }

  // Full logo (icon + wordmark)
  return (
    <svg
      width={size * 3.5}
      height={size}
      viewBox="0 0 350 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        animation: animated ? 'logoFloat 3s ease-in-out infinite' : 'none',
      }}
    >
      {/* Icon */}
      <g>
        {/* Background rounded square */}
        <rect
          x="8"
          y="8"
          width="84"
          height="84"
          rx="18"
          fill={primaryColor}
          opacity="0.1"
        />

        {/* Grid pattern */}
        <g opacity="0.8">
          {/* Top row */}
          <rect x="20" y="20" width="16" height="16" rx="3" fill={primaryColor} />
          <rect x="42" y="20" width="16" height="16" rx="3" fill={primaryColor} opacity="0.7" />
          <rect x="64" y="20" width="16" height="16" rx="3" fill={primaryColor} opacity="0.5" />

          {/* Middle row - center highlighted */}
          <rect x="20" y="42" width="16" height="16" rx="3" fill={primaryColor} opacity="0.7" />
          <rect x="42" y="42" width="16" height="16" rx="3" fill={accentColor} />
          <rect x="64" y="42" width="16" height="16" rx="3" fill={primaryColor} opacity="0.5" />

          {/* Bottom row */}
          <rect x="20" y="64" width="16" height="16" rx="3" fill={primaryColor} opacity="0.5" />
          <rect x="42" y="64" width="16" height="16" rx="3" fill={primaryColor} opacity="0.7" />
          <rect x="64" y="64" width="16" height="16" rx="3" fill={primaryColor} />
        </g>

        {/* Connecting lines */}
        <g stroke={accentColor} strokeWidth="2" opacity="0.6">
          <line x1="28" y1="36" x2="28" y2="42" />
          <line x1="50" y1="36" x2="50" y2="42" />
          <line x1="36" y1="50" x2="42" y2="50" />
          <line x1="58" y1="50" x2="64" y2="50" />
          <line x1="50" y1="58" x2="50" y2="64" />
        </g>
      </g>

      {/* Wordmark */}
      <text
        x="115"
        y="70"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="56"
        fontWeight="700"
        fill={textColor}
        letterSpacing="-0.02em"
      >
        Grid
      </text>

      {/* Tagline */}
      <text
        x="118"
        y="90"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="12"
        fontWeight="500"
        fill={textColor}
        opacity="0.5"
        letterSpacing="0.1em"
        style={{ textTransform: 'uppercase' }}
      >
        Project Management
      </text>

      <style>{`
        @keyframes logoFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </svg>
  );
};

export default GridLogo;
