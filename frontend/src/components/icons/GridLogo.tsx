import React from 'react';

interface GridLogoProps {
  size?: number;
  className?: string;
  variant?: 'full' | 'icon';
  showText?: boolean;
}

export const GridLogo: React.FC<GridLogoProps> = ({
  size = 40,
  className = '',
  variant = 'full',
  showText = true
}) => {
  const iconSize = variant === 'icon' ? size : size * 0.8;
  const fontSize = size * 0.5;

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      {/* Grid Icon - Modern 3D Grid Cube */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background glow effect */}
        <defs>
          <linearGradient id="gridPrimary" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#155dfc" />
            <stop offset="100%" stopColor="#0d3fb8" />
          </linearGradient>
          <linearGradient id="gridSecondary" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4a90ff" />
            <stop offset="100%" stopColor="#155dfc" />
          </linearGradient>
          <linearGradient id="gridAccent" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7db3ff" />
            <stop offset="100%" stopColor="#4a90ff" />
          </linearGradient>

          {/* Shadow filter */}
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
            <feOffset dx="0" dy="2" result="offsetblur"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.3"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Isometric 3D Grid Cube */}
        <g filter="url(#shadow)">
          {/* Left face - darkest */}
          <path
            d="M 24 8 L 10 16 L 10 32 L 24 40 L 24 24 L 10 16"
            fill="url(#gridPrimary)"
            opacity="0.9"
          />

          {/* Right face - medium */}
          <path
            d="M 24 8 L 38 16 L 38 32 L 24 40 L 24 24 L 38 16"
            fill="url(#gridSecondary)"
            opacity="0.95"
          />

          {/* Top face - lightest */}
          <path
            d="M 24 8 L 10 16 L 24 24 L 38 16 Z"
            fill="url(#gridAccent)"
          />

          {/* Grid lines on top face */}
          <path
            d="M 17 12 L 17 20 M 24 8 L 24 24 M 31 12 L 31 20"
            stroke="white"
            strokeWidth="1"
            strokeOpacity="0.4"
          />
          <path
            d="M 14 14 L 34 14 M 12 18 L 36 18"
            stroke="white"
            strokeWidth="1"
            strokeOpacity="0.4"
          />

          {/* Grid lines on left face */}
          <path
            d="M 10 20 L 24 28 M 10 24 L 24 32 M 10 28 L 24 36"
            stroke="white"
            strokeWidth="1"
            strokeOpacity="0.2"
          />

          {/* Grid lines on right face */}
          <path
            d="M 38 20 L 24 28 M 38 24 L 24 32 M 38 28 L 24 36"
            stroke="white"
            strokeWidth="1"
            strokeOpacity="0.25"
          />

          {/* Highlight edges for depth */}
          <path
            d="M 24 8 L 10 16 M 24 8 L 38 16"
            stroke="white"
            strokeWidth="1.5"
            strokeOpacity="0.6"
            strokeLinecap="round"
          />
        </g>
      </svg>

      {/* Grid Text */}
      {showText && variant === 'full' && (
        <span style={{
          fontSize: `${fontSize}px`,
          fontWeight: 700,
          color: '#1a1a1a',
          letterSpacing: '-0.02em',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
        }}>
          Grid
        </span>
      )}
    </div>
  );
};

// Simplified version for favicons/small sizes
export const GridLogoIcon: React.FC<{ size?: number }> = ({ size = 32 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="gridIconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#155dfc" />
          <stop offset="100%" stopColor="#0d3fb8" />
        </linearGradient>
      </defs>

      {/* Simplified cube for small sizes */}
      <path
        d="M 24 6 L 8 15 L 8 33 L 24 42 L 40 33 L 40 15 Z"
        fill="url(#gridIconGradient)"
      />

      {/* Simple grid pattern */}
      <path
        d="M 24 6 L 24 42 M 8 15 L 40 15 M 8 24 L 40 24 M 8 33 L 40 33"
        stroke="white"
        strokeWidth="2"
        strokeOpacity="0.4"
      />
      <path
        d="M 16 10.5 L 16 37.5 M 32 10.5 L 32 37.5"
        stroke="white"
        strokeWidth="2"
        strokeOpacity="0.3"
      />
    </svg>
  );
};

export default GridLogo;
