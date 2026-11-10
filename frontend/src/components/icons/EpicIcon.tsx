import React from 'react';

interface EpicIconProps {
  size?: number;
  color?: string;
  className?: string;
}

export const EpicIcon: React.FC<EpicIconProps> = ({
  size = 20,
  color = 'currentColor',
  className = ''
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Lightning bolt inside hexagon representing Epic feature */}
      <path
        d="M12 2L21 7V17L12 22L3 17V7L12 2Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 8L9 13H12L11 16L15 11H12L13 8Z"
        fill={color}
        opacity="0.8"
      />
    </svg>
  );
};

export default EpicIcon;
